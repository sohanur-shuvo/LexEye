// popup-new.js - Enhanced with Firebase Authentication and Google Login Support

// Firebase Configuration (from your frontend/.env)
const firebaseConfig = {
    apiKey: "AIzaSyCRQNQkhEnHJR7S9p8wfHaVyXaLgt0AI2U",
    authDomain: "meetingmuse-541a0.firebaseapp.com",
    projectId: "meetingmuse-541a0",
    storageBucket: "meetingmuse-541a0.firebasestorage.app",
    messagingSenderId: "71333603744",
    appId: "1:71333603744:web:a5c2b4e8f6d8a9c1b2d3e4"
};

// Import Firebase (using CDN in HTML would be better, but for extension we'll use a different approach)
// For Chrome extension, we need to include Firebase differently

console.log('[Meeting Recorder] Popup with auth loaded');

// DOM Elements
const loginSection = document.getElementById('loginSection');
const loggedInView = document.getElementById('loggedInView');
const loginFormView = document.getElementById('loginFormView');
const recordingControls = document.getElementById('recordingControls');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');
const loginError = document.getElementById('loginError');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const autoRecordCheckbox = document.getElementById('autoRecord');

let currentUser = null;

// Check if user is already logged in
checkAuthState();

async function checkAuthState() {
    try {
        const authData = await chrome.storage.local.get(['userAuth']);

        if (authData.userAuth && authData.userAuth.token) {
            // Verify token is still valid
            const isValid = await verifyToken(authData.userAuth.token);

            if (isValid) {
                currentUser = authData.userAuth;
                showLoggedInState();
            } else {
                // Token expired, clear it
                await chrome.storage.local.remove(['userAuth']);
                // Try checking web token
                await checkForWebToken();
                if (!currentUser) showLoginForm();
            }
        } else {
            // No stored auth, try checking web token
            await checkForWebToken();
            if (!currentUser) showLoginForm();
        }
    } catch (error) {
        console.error('[Meeting Recorder] Auth check failed:', error);
        showLoginForm();
    }
}

async function verifyToken(token) {
    try {
        // Verify token with backend
        const response = await fetch('https://meetingmuse-backend.onrender.com/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        return response.ok;
    } catch (error) {
        console.error('[Meeting Recorder] Token verification failed:', error);
        return false; // Fail gracefully
    }
}

// Check for token from the web application (localStorage)
async function checkForWebToken() {
    try {
        // Look for MeetingMuse tabs
        const tabs = await chrome.tabs.query({ url: ['https://meetingmuse-frontend.onrender.com/*', 'http://localhost:8080/*'] });

        if (!tabs || tabs.length === 0) return;

        console.log('[Meeting Recorder] Checking web tabs for session...');

        for (const tab of tabs) {
            try {
                // Determine if we can inject script (requires host permissions on localhost)
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        return {
                            token: localStorage.getItem('meetingmuse_extension_token'),
                            email: localStorage.getItem('meetingmuse_user_email'),
                            uid: localStorage.getItem('meetingmuse_user_uid')
                        };
                    }
                });

                if (results && results[0] && results[0].result && results[0].result.token) {
                    const data = results[0].result;
                    console.log('[Meeting Recorder] Found web session!');

                    // Save session
                    currentUser = {
                        email: data.email,
                        token: data.token,
                        userId: data.uid,
                        uid: data.uid
                    };

                    await chrome.storage.local.set({ userAuth: currentUser });

                    // Also store for content script to use
                    await chrome.storage.local.set({
                        autoUpload: true,
                        meetingMuseApiUrl: 'https://meetingmuse-backend.onrender.com/api/external/receive-recording',
                        meetingMuseApiKey: data.token,
                        meetingMuseUserId: data.uid
                    });

                    showLoggedInState();
                    return;
                }
            } catch (e) {
                console.log('[Meeting Recorder] Could not read from tab', tab.id, e);
            }
        }
    } catch (error) {
        console.error('[Meeting Recorder] Web token check error:', error);
    }
}

function showLoggedInState() {
    loginFormView.style.display = 'none';
    loggedInView.style.display = 'block';
    recordingControls.style.display = 'block';
    loginSection.classList.add('logged-in');

    if (currentUser && currentUser.email) {
        userEmail.textContent = currentUser.email;
    }

    // Initialize recording controls
    initializeRecordingControls();
}

function showLoginForm() {
    loginFormView.style.display = 'block';
    loggedInView.style.display = 'none';
    recordingControls.style.display = 'none';
    loginSection.classList.remove('logged-in');
}

// Login with Firebase (Email/Pass)
loginBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showError('Please enter email and password');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    loginError.style.display = 'none';

    try {
        // Login via Firebase Authentication using backend API
        const response = await fetch('https://meetingmuse-backend.onrender.com/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Login failed');
        }

        const data = await response.json();

        // Store auth data
        currentUser = {
            email: email,
            token: data.token,
            userId: data.userId,
            uid: data.uid
        };

        await chrome.storage.local.set({ userAuth: currentUser });

        // Also store for content script to use
        await chrome.storage.local.set({
            autoUpload: true,
            meetingMuseApiUrl: 'https://meetingmuse-backend.onrender.com/api/external/receive-recording',
            meetingMuseApiKey: data.token, // Use Firebase token as API key
            meetingMuseUserId: data.uid
        });

        console.log('[Meeting Recorder] Login successful');
        showLoggedInState();

    } catch (error) {
        console.error('[Meeting Recorder] Login error:', error);
        showError(error.message || 'Login failed. Please check your credentials.');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login to MeetingMuse';
    }
});

// Google Login Handler
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
        // Open the web app login page
        chrome.tabs.create({ url: 'https://meetingmuse-frontend.onrender.com/login' });
        // We rely on checkForWebToken running next time popup opens
        window.close();
    });
}

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        await chrome.storage.local.remove(['userAuth', 'autoUpload', 'meetingMuseApiKey', 'meetingMuseUserId']);
        currentUser = null;
        showLoginForm();
        emailInput.value = '';
        passwordInput.value = '';
        console.log('[Meeting Recorder] Logged out');
    } catch (error) {
        console.error('[Meeting Recorder] Logout error:', error);
    }
});

// Show error message
function showError(message) {
    loginError.textContent = message;
    loginError.style.display = 'block';
}

// Enter key to login
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});

// Recording Controls (same as before)
function initializeRecordingControls() {
    // Start button
    startBtn.addEventListener('click', async () => {
        console.log('[Meeting Recorder] Start clicked');

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs?.[0];

            if (!tab || !tab.id) {
                throw new Error('No active tab found');
            }

            const url = tab.url || '';
            const isMeetingPlatform = url.includes('teams.microsoft.com') ||
                url.includes('meet.google.com') ||
                url.includes('zoom.us');

            if (!isMeetingPlatform) {
                alert('⚠️ Not on a meeting platform!\\n\\nPlease navigate to:\\n• Microsoft Teams\\n• Google Meet\\n• Zoom\\n\\nThen try recording again.');
                return;
            }

            startBtn.disabled = true;

            chrome.runtime.sendMessage({
                type: 'START_RECORDING',
                tabId: tab.id
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Meeting Recorder] Runtime error:', chrome.runtime.lastError);
                    alert('Failed to communicate with extension. Please reload the page.');
                    startBtn.disabled = false;
                    return;
                }

                if (response && response.success) {
                    updateUI(true);
                } else {
                    const errorMsg = response?.error || 'Unknown error';
                    console.error('[Meeting Recorder] Start failed:', errorMsg);
                    alert(`Failed to start recording.\\n\\nError: ${errorMsg}`);
                    startBtn.disabled = false;
                }
            });

        } catch (error) {
            console.error('[Meeting Recorder] Start error:', error);
            alert(`Error: ${error.message}`);
            startBtn.disabled = false;
        }
    });

    // Stop button
    stopBtn.addEventListener('click', async () => {
        console.log('[Meeting Recorder] Stop clicked');

        try {
            stopBtn.disabled = true;

            chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Meeting Recorder] Runtime error:', chrome.runtime.lastError);
                    updateUI(false);
                    return;
                }

                if (response && response.success) {
                    updateUI(false);
                } else {
                    updateUI(false);
                }
            });

        } catch (error) {
            console.error('[Meeting Recorder] Stop error:', error);
            updateUI(false);
        }
    });

    // Check status
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
            updateUI(false);
            return;
        }

        if (response && response.isRecording) {
            updateUI(true);
        } else {
            checkMeetingStatus();
        }
    });

    // Load auto-record setting
    chrome.storage.local.get(['autoRecord'], (data) => {
        if (autoRecordCheckbox) {
            autoRecordCheckbox.checked = data.autoRecord === true;
        }
    });

    // Save auto-record setting
    if (autoRecordCheckbox) {
        autoRecordCheckbox.addEventListener('change', () => {
            chrome.storage.local.set({ autoRecord: autoRecordCheckbox.checked }, () => {
                console.log('[Meeting Recorder] Auto-record:', autoRecordCheckbox.checked);
            });
        });
    }
}

function updateUI(recording) {
    if (!statusDiv || !startBtn || !stopBtn) {
        return;
    }

    if (recording) {
        statusDiv.className = 'status recording';
        statusDiv.innerHTML = '<span class="recording-indicator"></span>Recording...';
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        statusDiv.className = 'status idle';
        statusDiv.textContent = 'Ready to record';
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

function checkMeetingStatus() {
    try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs?.[0];

            if (!tab || !tab.id) {
                updateUI(false);
                return;
            }

            chrome.tabs.sendMessage(tab.id, { type: 'GET_MEETING_STATUS' }, (response) => {
                if (chrome.runtime.lastError) {
                    updateUI(false);
                    return;
                }

                if (response && response.isInMeeting && response.platform) {
                    statusDiv.className = 'status in-meeting';
                    statusDiv.textContent = `${response.platform.toUpperCase()} meeting detected`;
                } else {
                    updateUI(false);
                }
            });
        });
    } catch (error) {
        console.error('[Meeting Recorder] Meeting status check failed:', error);
        updateUI(false);
    }
}
