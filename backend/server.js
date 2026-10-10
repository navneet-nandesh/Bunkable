const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
// 'axios-cookiejar-support' is dynamically imported in the route handler because it is an ES Module
const cheerio = require('cheerio');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// Gist DB logic for crowdsourced timetables
let GIST_ID = null;

async function initGistDB() {
    if (!process.env.GITHUB_TOKEN) {
        console.warn('No GITHUB_TOKEN provided. Timetable feature disabled.');
        return;
    }
    try {
        const response = await axios.get('https://api.github.com/gists', {
            headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
        });
        const gists = response.data;
        const dbGist = gists.find(g => g.description === 'Bunkable Timetables DB');
        
        if (dbGist) {
            GIST_ID = dbGist.id;
            console.log('Found Gist DB:', GIST_ID);
        } else {
            const createRes = await axios.post('https://api.github.com/gists', {
                description: 'Bunkable Timetables DB',
                public: false,
                files: { 'timetables.json': { content: '{}' } }
            }, {
                headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
            });
            GIST_ID = createRes.data.id;
            console.log('Created Gist DB:', GIST_ID);
        }
    } catch (err) {
        console.error('Failed to init Gist DB:', err.message);
    }
}
initGistDB();

app.post('/api/attendance', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        // Setup HTTP client that automatically stores cookies
        const jar = new CookieJar();
        const { wrapper } = await import('axios-cookiejar-support');
        const client = wrapper(axios.create({ 
            jar,
            withCredentials: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }));

        // 1. Send Login Request
        const loginPayload = new URLSearchParams();
        loginPayload.append('userid', username);
        loginPayload.append('password', password);
        
        const loginRes = await client.post('https://intranet.fisat.ac.in/', loginPayload.toString());
        
        if (loginRes.data.includes('Authentication Failed') || loginRes.data.includes('name="userid"')) {
            throw new Error('Authentication Failed. Please check your credentials.');
        }

        // Extract student name from the dashboard HTML
        let studentName = 'Student';
        const $dashboard = cheerio.load(loginRes.data);
        const nameText = $dashboard('.log_data').first().text();
        if (nameText) {
            studentName = nameText.split(',')[0].trim();
        }

        // 2. Fetch the Attendance Shell page to find the Batch ID (BID)
        const attendanceShellRes = await client.get('https://intranet.fisat.ac.in/index.php/ecampus/attendance');
        const $shell = cheerio.load(attendanceShellRes.data);
        
        const firstTab = $shell('.atnd_head').first();
        const bid = firstTab.attr('bid');
        
        if (!bid) {
            throw new Error('Could not find your current semester data.');
        }

        // 3. Fetch the actual Attendance Table Data using the hidden API!
        const reportPayload = new URLSearchParams();
        reportPayload.append('batchid', '0');
        
        const reportRes = await client.post(`https://intranet.fisat.ac.in/index.php/ecampus/attendancereport/${bid}`, reportPayload.toString());
        const $report = cheerio.load(reportRes.data);
        
        const subjects = [];
        $report('table tr').each((i, row) => {
            const cols = $report(row).find('td');
            if (cols.length >= 3) {
                const subjectName = $report(cols[0]).text().trim();
                const total = parseInt($report(cols[1]).text().trim(), 10);
                const attended = parseInt($report(cols[2]).text().trim(), 10);
                
                // Keep only valid subject rows (ignore headers, dates, and totals)
                // A valid subject name must contain at least one letter!
                const hasLetters = /[a-zA-Z]/.test(subjectName);
                if (total > 0 && !isNaN(total) && !isNaN(attended) && subjectName.length > 2 && !subjectName.toLowerCase().includes('total') && hasLetters) {
                    subjects.push({ name: subjectName, attended, total });
                }
            }
        });

        // Return everything instantly
        res.json({ success: true, data: subjects, name: studentName });

    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).json({ error: error.message || error.toString() });
    }
});

// Timetable Endpoints
app.get('/api/timetables/:bid', async (req, res) => {
    if (!GIST_ID || !process.env.GITHUB_TOKEN) return res.status(500).json({ error: 'DB not ready' });
    try {
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
        });
        const content = response.data.files['timetables.json'].content;
        const db = JSON.parse(content);
        res.json({ success: true, timetable: db[req.params.bid] || null });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch timetable' });
    }
});

app.post('/api/timetables/:bid', async (req, res) => {
    if (!GIST_ID || !process.env.GITHUB_TOKEN) return res.status(500).json({ error: 'DB not ready' });
    try {
        // Fetch current DB
        const getRes = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
        });
        const db = JSON.parse(getRes.data.files['timetables.json'].content);
        
        // Update DB
        db[req.params.bid] = req.body.timetable;
        
        // Save back to Gist
        await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
            files: { 'timetables.json': { content: JSON.stringify(db, null, 2) } }
        }, {
            headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` }
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save timetable' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
