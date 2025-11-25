// popup.js - Simple controls

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const autoRecordCheckbox = document.getElementById('autoRecord');

console.log('[Meeting Recorder] Popup opened');

// Start button
startBtn.addEventListener('click', async () => {
  console.log('[Meeting Recorder] Start clicked');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    tabId: tab.id
  }, (response) => {
    if (response && response.success) {
      updateUI(true);

      // Show microphone status
      if (response.micCaptured) {
        console.log('[Meeting Recorder] ✓ Recording with microphone');
      } else {
        console.warn('[Meeting Recorder] ✗ Recording WITHOUT microphone');
      }
    } else {
      alert('Failed to start recording. Make sure you:\n1. Click "Share"\n2. Select a tab/window/screen\n3. Check "Share audio"\n4. Allow microphone access');
    }
  });
});

// Stop button
stopBtn.addEventListener('click', () => {
  console.log('[Meeting Recorder] Stop clicked');
  
  chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, () => {
    updateUI(false);
  });
});

// Update UI
function updateUI(recording) {
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

// Check status on open
chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
  if (response && response.isRecording) {
    updateUI(true);
  } else {
    // Check if in a meeting
    checkMeetingStatus();
  }
});

// Check meeting status
function checkMeetingStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;

    chrome.tabs.sendMessage(tab.id, { type: 'GET_MEETING_STATUS' }, (response) => {
      if (chrome.runtime.lastError) {
        // Not on a meeting page
        updateUI(false);
        return;
      }

      if (response && response.isInMeeting && response.platform) {
        // Show meeting detected status
        statusDiv.className = 'status in-meeting';
        statusDiv.textContent = `Meeting detected: ${response.platform.toUpperCase()}`;
      } else {
        updateUI(false);
      }
    });
  });
}

// Load saved auto-record setting
chrome.storage.local.get(['autoRecord'], (data) => {
  autoRecordCheckbox.checked = data.autoRecord || false;
});

// Save auto-record setting when changed
autoRecordCheckbox.addEventListener('change', () => {
  chrome.storage.local.set({ autoRecord: autoRecordCheckbox.checked });
  console.log('[Meeting Recorder] Auto-record:', autoRecordCheckbox.checked);
});