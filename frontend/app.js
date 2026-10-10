document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const loginForm = document.getElementById('login-form');
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const loginBtnText = document.querySelector('.btn-text');
    const spinner = document.querySelector('.spinner');
    const targetInput = document.getElementById('target-attendance');
    const subjectsGrid = document.getElementById('subjects-grid');
    const logoutBtn = document.getElementById('logout-btn');
    const loginError = document.getElementById('login-error');
    const rememberMeCheckbox = document.getElementById('remember-me');

    // Global state for attendance data
    const subjectsData = [];

    // Event Listeners
    loginForm.addEventListener('submit', handleLogin);
    targetInput.addEventListener('input', updateDashboard);
    logoutBtn.addEventListener('click', handleLogout);

    // Auto-login logic
    const savedUser = localStorage.getItem('bunkable_user');
    const savedPass = localStorage.getItem('bunkable_pass');
    
    if (savedUser && savedPass) {
        document.getElementById('student-id').value = savedUser;
        document.getElementById('password').value = atob(savedPass); // Decode obfuscated password
        if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        // Trigger login automatically
        setTimeout(() => loginForm.dispatchEvent(new Event('submit')), 100);
    }

    async function handleLogin(e) {
        e.preventDefault();
        
        // Clear previous error
        loginError.classList.add('hidden');
        loginError.innerText = '';
        
        // UI Loading state
        loginBtnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        
        const username = document.getElementById('student-id').value;
        const password = document.getElementById('password').value;

        try {
            // Use local backend for development, or your live Render URL for production!
            const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                ? 'http://localhost:3000' 
                : 'https://bunkable-3.onrender.com';

            const response = await fetch(`${BACKEND_URL}/api/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            let result;
            try {
                result = await response.json();
            } catch (jsonError) {
                // This happens if Render returns an HTML error page (like a 502 Bad Gateway during deployment)
                throw new Error(`Server is starting up or temporarily offline (Status ${response.status}). Please try again in 1 minute.`);
            }
            
            if (response.ok && result.success) {
                // Populate data
                subjectsData.length = 0;
                subjectsData.push(...result.data);
                if (result.name) {
                    document.getElementById('user-name').innerText = result.name;
                }
                
                // Fetch Timetable from Cloud
                if (result.bid) {
                    window.currentBatchId = result.bid;
                    fetchTimetable(result.bid);
                }

                // Save credentials if Remember Me is checked
                if (rememberMeCheckbox && rememberMeCheckbox.checked) {
                    localStorage.setItem('bunkable_user', username);
                    localStorage.setItem('bunkable_pass', btoa(password)); // Simple Base64 obfuscation
                } else {
                    localStorage.removeItem('bunkable_user');
                    localStorage.removeItem('bunkable_pass');
                }
                
                // Transition pages
                loginSection.classList.remove('active');
                loginSection.classList.add('hidden');
                
                dashboardSection.classList.remove('hidden');
                // small delay to allow display:block to apply before animation
                setTimeout(() => {
                    dashboardSection.classList.add('active');
                    updateDashboard();
                }, 50);
                
            } else {
                console.warn("Backend error:", result.error);
                loginError.innerText = result.error || "Invalid credentials or portal error.";
                loginError.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Fetch error:", error);
            const msg = error.message.includes('Server is starting up') 
                ? error.message 
                : "Could not reach the backend server. It may be asleep or blocked.";
            loginError.innerText = msg;
            loginError.classList.remove('hidden');
        } finally {
            loginBtnText.classList.remove('hidden');
            spinner.classList.add('hidden');
        }
    }

    function handleLogout() {
        // Clear saved credentials when explicitly logging out
        localStorage.removeItem('bunkable_user');
        localStorage.removeItem('bunkable_pass');

        dashboardSection.classList.remove('active');
        setTimeout(() => {
            dashboardSection.classList.add('hidden');
            loginSection.classList.remove('hidden');
            setTimeout(() => {
                loginSection.classList.add('active');
                loginForm.reset();
            }, 50);
        }, 500);
    }

    function calculateActionNeeded(attended, total, targetPercent) {
        const target = targetPercent / 100;
        const currentRatio = attended / total;

        if (currentRatio >= target) {
            // Can afford to miss
            // attended / (total + missed) >= target
            // missed <= (attended / target) - total
            const canMiss = Math.floor((attended / target) - total);
            return {
                status: canMiss > 0 ? 'safe' : 'warning',
                text: canMiss > 0 
                    ? `You can afford to miss ${canMiss} class${canMiss > 1 ? 'es' : ''}` 
                    : `On the edge! Don't miss the next class.`
            };
        } else {
            // Need to attend
            // (attended + needed) / (total + needed) >= target
            // needed >= (target * total - attended) / (1 - target)
            const needed = Math.ceil((target * total - attended) / (1 - target));
            return {
                status: 'danger',
                text: `You must attend the next ${needed} class${needed > 1 ? 'es' : ''}`
            };
        }
    }

    function getPercentageColor(percentage, target) {
        if (percentage >= target + 5) return 'var(--success)';
        if (percentage >= target) return 'var(--warning)';
        return 'var(--danger)';
    }

    function updateDashboard() {
        const targetPercent = parseFloat(targetInput.value) || 75;
        
        subjectsGrid.innerHTML = ''; // Clear grid
        
        let overallAttended = 0;
        let overallTotal = 0;

        subjectsData.forEach((subject, index) => {
            overallAttended += subject.attended;
            overallTotal += subject.total;

            const percentage = ((subject.attended / subject.total) * 100).toFixed(1);
            const color = getPercentageColor(percentage, targetPercent);
            const action = calculateActionNeeded(subject.attended, subject.total, targetPercent);
            
            // Calculate SVG stroke offset
            const radius = 35;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (percentage / 100) * circumference;

            const card = document.createElement('div');
            card.className = 'subject-card';
            card.innerHTML = `
                <div class="subject-header">
                    <h3>${subject.name}</h3>
                </div>
                <div class="attendance-visuals">
                    <div class="progress-ring">
                        <svg viewBox="0 0 80 80">
                            <circle class="bg" cx="40" cy="40" r="35"></circle>
                            <circle class="progress" cx="40" cy="40" r="35" 
                                style="stroke: ${color}; stroke-dashoffset: ${circumference}"></circle>
                        </svg>
                        <div class="progress-text" style="color: ${color}">${percentage}%</div>
                    </div>
                    <div class="attendance-numbers">
                        <p>${subject.attended} <span style="color: var(--text-muted)">/ ${subject.total}</span></p>
                        <span>Classes</span>
                    </div>
                </div>
                <div class="action-status status-${action.status}">
                    ${getStatusIcon(action.status)}
                    ${action.text}
                </div>
            `;
            
            subjectsGrid.appendChild(card);

            // Animate progress ring after a small delay
            setTimeout(() => {
                const progressCircle = card.querySelector('.progress');
                progressCircle.style.strokeDashoffset = Math.max(0, offset);
            }, 100 * index);
        });

        // Update overall stats
        const overallPercentage = ((overallAttended / overallTotal) * 100).toFixed(1);
        document.getElementById('overall-percentage').textContent = `${overallPercentage}%`;
        document.getElementById('overall-percentage').style.color = getPercentageColor(overallPercentage, targetPercent);
        document.getElementById('overall-total').textContent = overallTotal;
        document.getElementById('overall-attended').textContent = overallAttended;
    }

    function getStatusIcon(status) {
        if (status === 'safe') {
            return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        } else if (status === 'warning') {
            return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        } else {
            return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
        }
    }

    // --- Timetable Logic ---
    async function fetchTimetable(bid) {
        const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                ? 'http://localhost:3000' : 'https://bunkable-3.onrender.com';
        try {
            const res = await fetch(`${BACKEND_URL}/api/timetables/${bid}`);
            const data = await res.json();
            if (data.success && data.timetable) {
                renderTodayTimetable(data.timetable);
            } else {
                showTimetableMissing();
            }
        } catch (e) {
            document.getElementById('timetable-content').innerHTML = `<p style="color:var(--danger)">Failed to load timetable from cloud.</p>`;
        }
    }

    function renderTodayTimetable(timetable) {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayIdx = new Date().getDay();
        const todayStr = days[todayIdx];
        document.getElementById('current-day').innerText = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);
        
        if (todayIdx === 0 || todayIdx === 6) {
            document.getElementById('timetable-content').innerHTML = `<p style="text-align:center; color: var(--text-muted); margin-top: 10px;">It's the weekend! No classes today. 🎉</p>`;
            return;
        }

        const todayClasses = timetable[todayStr] || [];
        if (todayClasses.length === 0) {
            document.getElementById('timetable-content').innerHTML = `<p style="text-align:center; color: var(--text-muted);">No classes scheduled for today.</p>`;
            return;
        }

        let html = '';
        todayClasses.forEach((cls, i) => {
            if (!cls || cls === 'FREE') return;
            const subj = subjectsData.find(s => s.name === cls);
            let color = 'var(--text-main)';
            let percText = '';
            if (subj) {
                const perc = (subj.attended / subj.total) * 100;
                const target = parseFloat(document.getElementById('target-attendance').value) || 75;
                color = getPercentageColor(perc, target);
                percText = `<span style="color:${color}; font-weight:700;">${perc.toFixed(1)}%</span>`;
            }
            html += `<div class="period-item">
                <div style="display:flex; align-items:center; gap: 15px;">
                    <span style="color:var(--text-muted); font-size: 0.9rem;">${i+1}</span>
                    <span class="period-name">${cls}</span>
                </div>
                ${percText}
            </div>`;
        });
        document.getElementById('timetable-content').innerHTML = html || `<p style="text-align:center; color: var(--text-muted);">Free day! 🎉</p>`;
    }

    function showTimetableMissing() {
        document.getElementById('timetable-content').innerHTML = `
            <div style="text-align:center; padding: 10px;">
                <p style="margin-bottom:15px; color:var(--text-muted); font-size: 0.95rem;">No cloud timetable exists for your batch yet.</p>
                <button id="setup-timetable-btn" class="btn-primary" style="padding: 12px; font-size: 0.95rem; width: auto; margin: 0 auto;">Setup Timetable for Everyone</button>
            </div>
        `;
        document.getElementById('setup-timetable-btn').addEventListener('click', openTimetableBuilder);
    }

    function openTimetableBuilder() {
        const modal = document.getElementById('timetable-modal');
        const builder = document.getElementById('timetable-builder');
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        
        let html = '';
        days.forEach(day => {
            html += `<div class="builder-day">${day.toUpperCase()}</div>`;
            for (let i = 0; i < 6; i++) {
                html += `<select class="builder-select" data-day="${day}" data-period="${i}">
                    <option value="FREE">-- Free Period --</option>`;
                subjectsData.forEach(s => {
                    html += `<option value="${s.name}">${s.name}</option>`;
                });
                html += `</select>`;
            }
        });
        builder.innerHTML = html;
        modal.classList.remove('hidden');
    }

    document.getElementById('ai-upload-btn').addEventListener('click', () => {
        document.getElementById('ai-timetable-upload').click();
    });

    document.getElementById('ai-timetable-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const btn = document.getElementById('ai-upload-btn');
        const originalText = btn.innerText;
        btn.innerText = '✨ AI is reading image...';
        btn.disabled = true;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const imageBase64 = reader.result;
            const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                ? 'http://localhost:3000' : 'https://bunkable-3.onrender.com';
            
            try {
                const res = await fetch(`${BACKEND_URL}/api/timetables/extract`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageBase64,
                        subjects: subjectsData.map(s => s.name)
                    })
                });
                
                const data = await res.json();
                if (data.success && data.timetable) {
                    // Auto-fill the select boxes
                    const tt = data.timetable;
                    document.querySelectorAll('.builder-select').forEach(select => {
                        const day = select.dataset.day;
                        const period = select.dataset.period;
                        if (tt[day] && tt[day][period]) {
                            const val = tt[day][period];
                            if (Array.from(select.options).some(opt => opt.value === val)) {
                                select.value = val;
                            } else {
                                select.value = 'FREE';
                            }
                        }
                    });
                    alert('✨ Timetable successfully imported by AI! Please verify the entries before publishing.');
                } else {
                    alert('AI failed to parse the timetable. Try a clearer image.');
                }
            } catch (err) {
                alert('Connection error during AI extraction.');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
                e.target.value = ''; // reset file input
            }
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('cancel-timetable').addEventListener('click', () => {
        document.getElementById('timetable-modal').classList.add('hidden');
    });

    document.getElementById('save-timetable').addEventListener('click', async (e) => {
        const btn = e.target;
        btn.innerText = 'Publishing...';
        
        const timetable = { monday:[], tuesday:[], wednesday:[], thursday:[], friday:[] };
        document.querySelectorAll('.builder-select').forEach(select => {
            const day = select.dataset.day;
            timetable[day].push(select.value);
        });

        const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                ? 'http://localhost:3000' : 'https://bunkable-3.onrender.com';
        
        try {
            await fetch(`${BACKEND_URL}/api/timetables/${window.currentBatchId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timetable })
            });
            document.getElementById('timetable-modal').classList.add('hidden');
            renderTodayTimetable(timetable);
        } catch (e) {
            alert('Failed to save to cloud. Please check your connection.');
        } finally {
            btn.innerText = 'Publish to Cloud';
        }
    });

});
