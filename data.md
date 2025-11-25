# Meeting Recorder Extension - Complete Code

## File 1: manifest.json

```json
{
  "manifest_version": 3,
  "name": "Meeting Recorder",
  "version": "1.0.0",
  "description": "Automatically detect and record online meetings",
  
  "permissions": [
    "tabCapture",
    "storage",
    "notifications",
    "activeTab",
    "downloads"
  ],
  
  "host_permissions": [
    "https://teams.microsoft.com/*",
    "https://meet.google.com/*",
    "https://*.zoom.us/*"
  ],
  
  "background": {
    "service_worker": "background.js"
  },
  
  "content_scripts": [
    {
      "matches": [
        "https://teams.microsoft.com/*",
        "https://meet.google.com/*",
        "https://*.zoom.us/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

## File 2: background.js

```javascript
// background.js - Handles recording logic

class RecordingManager {
  constructor() {
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.currentTabId = null;
    this.stream = null;
  }

  async startRecording(tabId) {
    try {
      // Get the tab's media stream
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        },
        preferCurrentTab: true
      });

      // Add microphone audio
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });

        // Mix audio tracks
        const audioContext = new AudioContext();
        const dest = audioContext.createMediaStreamDestination();
        
        // Add system audio
        if (this.stream.getAudioTracks().length > 0) {
          const systemSource = audioContext.createMediaStreamSource(
            new MediaStream(this.stream.getAudioTracks())
          );
          systemSource.connect(dest);
        }
        
        // Add mic audio
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(dest);

        // Combine video + mixed audio
        const finalStream = new MediaStream([
          ...this.stream.getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ]);

        this.stream = finalStream;
      } catch (micError) {
        console.warn('Microphone access denied, recording without mic:', micError);
      }

      // Setup MediaRecorder
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 2500000
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.saveRecording();
      };

      this.mediaRecorder.start(1000); // Capture data every second
      this.isRecording = true;
      this.currentTabId = tabId;

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Recording Started',
        message: 'Meeting recording in progress...'
      });

      return { success: true };
    } catch (error) {
      console.error('Recording start failed:', error);
      return { success: false, error: error.message };
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      
      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      this.isRecording = false;
      this.currentTabId = null;

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Recording Stopped',
        message: 'Saving your recording...'
      });
    }
  }

  saveRecording() {
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    chrome.downloads.download({
      url: url,
      filename: `meeting-recording-${timestamp}.webm`,
      saveAs: true
    }, (downloadId) => {
      if (downloadId) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Recording Saved',
          message: 'Your meeting recording has been saved!'
        });
      }
    });

    this.recordedChunks = [];
  }

  getStatus() {
    return {
      isRecording: this.isRecording,
      tabId: this.currentTabId
    };
  }
}

const recorder = new RecordingManager();

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch(message.type) {
    case 'START_RECORDING':
      recorder.startRecording(message.tabId).then(sendResponse);
      return true;

    case 'STOP_RECORDING':
      recorder.stopRecording();
      sendResponse({ success: true });
      break;

    case 'GET_RECORDING_STATUS':
      sendResponse(recorder.getStatus());
      break;

    case 'MEETING_STATUS_CHANGED':
      // Store meeting status for auto-record feature
      chrome.storage.local.get(['autoRecord'], (data) => {
        if (data.autoRecord && message.isInMeeting && !recorder.isRecording) {
          // Auto-start recording if enabled
          recorder.startRecording(sender.tab.id);
        } else if (!message.isInMeeting && recorder.isRecording) {
          // Auto-stop when meeting ends
          recorder.stopRecording();
        }
      });
      break;
  }
});
```

## File 3: content.js

```javascript
// content.js - Detects when user joins a meeting

class MeetingDetector {
  constructor() {
    this.platform = this.detectPlatform();
    this.isInMeeting = false;
    this.checkInterval = null;
  }

  detectPlatform() {
    const url = window.location.hostname;
    if (url.includes('teams.microsoft.com')) return 'teams';
    if (url.includes('meet.google.com')) return 'meet';
    if (url.includes('zoom.us')) return 'zoom';
    return null;
  }

  startDetection() {
    // Check immediately
    this.checkMeetingStatus();
    
    // Then check every 3 seconds
    this.checkInterval = setInterval(() => {
      this.checkMeetingStatus();
    }, 3000);
  }

  checkMeetingStatus() {
    let inMeeting = false;

    switch(this.platform) {
      case 'teams':
        // Check for video/call controls
        inMeeting = !!(
          document.querySelector('[data-tid="callingButtons"]') ||
          document.querySelector('[data-tid="calling-screen"]') ||
          document.querySelector('.calling-screen')
        );
        break;

      case 'meet':
        // Check for Google Meet call interface
        inMeeting = !!(
          document.querySelector('[data-meeting-title]') ||
          document.querySelector('[data-self-name]') ||
          document.querySelector('div[data-fps-request-screencast-cap]')
        );
        break;

      case 'zoom':
        // Check for Zoom meeting interface
        inMeeting = !!(
          document.querySelector('#wc-container') ||
          document.querySelector('.meeting-app') ||
          document.querySelector('[aria-label*="meeting"]')
        );
        break;
    }

    if (inMeeting !== this.isInMeeting) {
      this.isInMeeting = inMeeting;
      this.notifyStatusChange();
    }
  }

  notifyStatusChange() {
    chrome.runtime.sendMessage({
      type: 'MEETING_STATUS_CHANGED',
      platform: this.platform,
      isInMeeting: this.isInMeeting,
      url: window.location.href
    });
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

// Initialize detector
const detector = new MeetingDetector();
if (detector.platform) {
  detector.startDetection();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_MEETING_STATUS') {
    sendResponse({
      platform: detector.platform,
      isInMeeting: detector.isInMeeting
    });
  }
  return true;
});
```

## File 4: popup.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      width: 320px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
    }

    h2 {
      margin: 0 0 16px 0;
      font-size: 18px;
      color: #333;
    }

    .status {
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .status.idle {
      background: #f0f0f0;
      color: #666;
    }

    .status.recording {
      background: #fee;
      color: #c00;
      font-weight: 600;
    }

    .status.in-meeting {
      background: #efe;
      color: #060;
    }

    .controls {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    button {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .start-btn {
      background: #4CAF50;
      color: white;
    }

    .stop-btn {
      background: #f44336;
      color: white;
    }

    .settings {
      border-top: 1px solid #e0e0e0;
      padding-top: 16px;
    }

    label {
      display: flex;
      align-items: center;
      font-size: 14px;
      color: #333;
      cursor: pointer;
    }

    input[type="checkbox"] {
      margin-right: 8px;
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .info {
      font-size: 12px;
      color: #666;
      margin-top: 8px;
      line-height: 1.4;
    }

    .recording-indicator {
      display: inline-block;
      width: 10px;
      height: 10px;
      background: #f44336;
      border-radius: 50%;
      margin-right: 8px;
      animation: blink 1.5s infinite;
    }

    @keyframes blink {
      0%, 50%, 100% { opacity: 1; }
      25%, 75% { opacity: 0.3; }
    }
  </style>
</head>
<body>
  <h2>🎥 Meeting Recorder</h2>
  
  <div id="status" class="status idle">
    Status: Idle
  </div>

  <div class="controls">
    <button id="startBtn" class="start-btn">Start Recording</button>
    <button id="stopBtn" class="stop-btn" disabled>Stop Recording</button>
  </div>

  <div class="settings">
    <label>
      <input type="checkbox" id="autoRecord">
      Auto-record meetings
    </label>
    <div class="info">
      Automatically start/stop recording when meetings are detected
    </div>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

## File 5: popup.js

```javascript
// popup.js - Controls the popup interface

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const autoRecordCheckbox = document.getElementById('autoRecord');

// Load saved settings
chrome.storage.local.get(['autoRecord'], (data) => {
  autoRecordCheckbox.checked = data.autoRecord || false;
});

// Save auto-record setting
autoRecordCheckbox.addEventListener('change', () => {
  chrome.storage.local.set({ autoRecord: autoRecordCheckbox.checked });
});

// Start recording
startBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    tabId: tab.id
  }, (response) => {
    if (response && response.success) {
      updateUI(true);
    } else {
      alert('Failed to start recording. Please ensure you grant screen capture permissions.');
    }
  });
});

// Stop recording
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, () => {
    updateUI(false);
  });
});

// Update UI based on recording status
function updateUI(isRecording) {
  if (isRecording) {
    statusDiv.className = 'status recording';
    statusDiv.innerHTML = '<span class="recording-indicator"></span>Recording in progress...';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusDiv.className = 'status idle';
    statusDiv.textContent = 'Status: Idle';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// Check current recording status on popup open
chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (status) => {
  if (status && status.isRecording) {
    updateUI(true);
  }
});

// Check if currently in a meeting
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_MEETING_STATUS' }, (response) => {
      if (response && response.isInMeeting) {
        if (!statusDiv.classList.contains('recording')) {
          statusDiv.className = 'status in-meeting';
          statusDiv.textContent = `Meeting detected: ${response.platform}`;
        }
      }
    });
  }
});
```

---

## Installation Steps:

1. **Create folder structure:**
   ```
   meeting-recorder/
   ├── manifest.json
   ├── background.js
   ├── content.js
   ├── popup.html
   ├── popup.js
   └── icons/
       ├── icon16.png
       ├── icon48.png
       └── icon128.png
   ```

2. **Create icons:** You need 3 PNG icon files (16x16, 48x48, 128x128). You can create simple icons or download from icon websites.

3. **Load in Chrome/Edge:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select your `meeting-recorder` folder

4. **Grant permissions:** First time you click "Start Recording", browser will ask for screen and microphone permissions.

## Usage:

- **Manual:** Click extension icon → Click "Start Recording"
- **Automatic:** Enable "Auto-record meetings" checkbox
- Recordings save as `.webm` files in your Downloads folder