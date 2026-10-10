const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

let browserInstance = null;
async function getBrowser() {
    if (!browserInstance) {
        console.log('Launching new Puppeteer browser instance...');
        browserInstance = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        browserInstance.on('disconnected', () => {
            console.log('Puppeteer browser disconnected. Will relaunch on next request.');
            browserInstance = null;
        });
    }
    return browserInstance;
}

app.post('/api/attendance', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    let page;
    let context;
    try {
        const browser = await getBrowser();
        // Use an incognito context so cookies aren't shared between requests!
        context = await browser.createIncognitoBrowserContext();
        page = await context.newPage();

        // SPEED OPTIMIZATION: Block images and fonts from loading!
        // We leave 'stylesheet' alone because Puppeteer needs CSS to calculate 'innerText' properly.
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // ---------------------------------------------------------
        // TODO: Adapt this section to match your college portal
        // ---------------------------------------------------------

        // 1. Navigate to the login page
        const PORTAL_URL = 'https://intranet.fisat.ac.in/';
        await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' });

        // Handle any popup alerts from the portal (e.g. wrong password)
        page.on('dialog', async dialog => {
            const msg = dialog.message();
            await dialog.accept();
            throw new Error(`Portal Alert: ${msg}`);
        });

        // 2. Fill in the credentials
        await page.waitForSelector('input[name="userid"]', { timeout: 15000 });
        await page.type('input[name="userid"]', username);
        await page.type('input[name="password"]', password);

        // 3. Click login and wait for the dashboard to load
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            page.click('input[type="submit"]')
        ]);

        // Bulletproof check: If the username input is still on the page, login failed!
        const isStillOnLoginPage = await page.$('input[name="userid"]');
        if (isStillOnLoginPage) {
            throw new Error('Authentication Failed. Please check your credentials.');
        }

        // 4. Scrape the student name from the dashboard
        let studentName = 'Student';
        try {
            const nameText = await page.$eval('.log_data', el => el.innerText);
            studentName = nameText.split(',')[0].trim();
        } catch(e) {}

        // 5. Navigate to the Attendance page safely (Handles both AJAX and Full Page reloads instantly!)
        const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        const selPromise = page.waitForSelector('.atnd_head', { timeout: 15000 }).catch(() => {});
        
        await page.evaluate(() => {
            const allEls = document.querySelectorAll('a, li, div, span, button');
            for (const el of allEls) {
                const text = el.innerText ? el.innerText.trim() : '';
                if (text === 'Statements of Attendance' || text === 'Attendance') {
                    el.click();
                    return;
                }
            }
        });

        // Wait for EITHER a page reload OR the attendance table to appear via AJAX!
        await Promise.race([navPromise, selPromise]);
        
        // Wait up to 5 more seconds just to guarantee the element is fully rendered
        const atndHead = await page.waitForSelector('.atnd_head', { timeout: 5000 }).catch(() => null);
        if (!atndHead) {
            throw new Error('Attendance table failed to load. The portal might be slow or under maintenance.');
        }
        
        // 6. Click the most recent semester tab to load the table
        await page.click('.atnd_head');
        await page.waitForSelector('.atnd_info_box table', { timeout: 10000 }).catch(e => console.log('Timeout'));

        // 7. Scrape the real attendance data!
        const attendanceData = await page.evaluate(() => {
            const subjects = [];
            // The subject-wise listing is in the second table of the loaded info box
            const tables = document.querySelectorAll('.atnd_info_box table');
            if (tables.length < 2) return subjects;
            
            const rows = tables[1].querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 3) {
                    const total = parseInt(cols[1].innerText.trim(), 10) || 0;
                    const attended = parseInt(cols[2].innerText.trim(), 10) || 0;
                    
                    // Only include subjects that actually have classes scheduled
                    if (total > 0) {
                        subjects.push({
                            name: cols[0].innerText.trim(),
                            attended: attended,
                            total: total
                        });
                    }
                }
            });
            return subjects;
        });

        // ---------------------------------------------------------
        // End of portal-specific logic
        // ---------------------------------------------------------

        // Return the scraped data and name to the frontend
        res.json({ success: true, data: attendanceData, name: studentName });

    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: error.message || error.toString() });
    } finally {
        if (context) {
            await context.close().catch(e => console.error('Error closing context:', e));
        } else if (page) {
            await page.close().catch(e => console.error('Error closing page:', e));
        }
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
