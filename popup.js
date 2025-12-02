// popup.js - Enhanced controls with error handling

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const autoRecordCheckbox = document.getElementById('autoRecord');

console.log('[Meeting Recorder] Popup opened');

// Validate DOM elements loaded
if (!startBtn || !stopBtn || !statusDiv || !autoRecordCheckbox) {
  console.error('[Meeting Recorder] Failed to load popup elements');
}

// Start button with error handling
startBtn.addEventListener('click', async () => {
  console.log('[Meeting Recorder] Start clicked');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];

    if (!tab || !tab.id) {
      throw new Error('No active tab found');
    }

    // Validate tab URL is a meeting platform
    const url = tab.url || '';
    const isMeetingPlatform = url.includes('teams.microsoft.com') ||
                              url.includes('meet.google.com') ||
                              url.includes('zoom.us');

    if (!isMeetingPlatform) {
      alert('⚠️ Not on a meeting platform!\n\nPlease navigate to:\n• Microsoft Teams\n• Google Meet\n• Zoom\n\nThen try recording again.');
      return;
    }

    // Disable button to prevent double-click
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

        // Show microphone status
        if (response.micCaptured) {
          console.log('[Meeting Recorder] ✓ Recording with microphone');
        } else {
          console.warn('[Meeting Recorder] ✗ Recording WITHOUT microphone');
          // User already sees notification from content script
        }
      } else {
        const errorMsg = response?.error || 'Unknown error';
        console.error('[Meeting Recorder] Start failed:', errorMsg);
        alert(`Failed to start recording.\n\nError: ${errorMsg}\n\nMake sure you:\n1. Click "Share" when prompted\n2. Select a tab/window/screen\n3. Check "Share audio"\n4. Grant microphone permission`);
        startBtn.disabled = false;
      }
    });

  } catch (error) {
    console.error('[Meeting Recorder] Start error:', error);
    alert(`Error: ${error.message}`);
    startBtn.disabled = false;
  }
});

// Stop button with error handling
stopBtn.addEventListener('click', async () => {
  console.log('[Meeting Recorder] Stop clicked');

  try {
    // Disable button to prevent double-click
    stopBtn.disabled = true;

    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Meeting Recorder] Runtime error:', chrome.runtime.lastError);
        alert('Failed to stop recording. The recording may have already ended.');
        updateUI(false);
        return;
      }

      if (response && response.success) {
        updateUI(false);
        const duration = response.duration || 0;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        console.log(`[Meeting Recorder] Recording stopped. Duration: ${minutes}m ${seconds}s`);
      } else {
        console.error('[Meeting Recorder] Stop failed:', response?.error);
        // Still update UI as recording likely stopped
        updateUI(false);
      }
    });

  } catch (error) {
    console.error('[Meeting Recorder] Stop error:', error);
    updateUI(false);
  }
});

// Update UI with validation
function updateUI(recording) {
  if (!statusDiv || !startBtn || !stopBtn) {
    console.error('[Meeting Recorder] UI elements not available');
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

// Check status on open with error handling
try {
  chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Meeting Recorder] Status check error:', chrome.runtime.lastError);
      updateUI(false);
      return;
    }

    if (response && response.isRecording) {
      updateUI(true);

      // Show duration if available
      if (response.duration) {
        const minutes = Math.floor(response.duration / 60);
        const seconds = response.duration % 60;
        statusDiv.innerHTML = `<span class="recording-indicator"></span>Recording... (${minutes}:${seconds.toString().padStart(2, '0')})`;
      }
    } else {
      // Check if in a meeting
      checkMeetingStatus();
    }
  });
} catch (error) {
  console.error('[Meeting Recorder] Initial status check failed:', error);
  updateUI(false);
}

// Check meeting status with error handling
function checkMeetingStatus() {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];

      if (!tab || !tab.id) {
        console.warn('[Meeting Recorder] No active tab');
        updateUI(false);
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'GET_MEETING_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
          // Not on a meeting page or content script not loaded
          updateUI(false);
          return;
        }

        if (response && response.isInMeeting && response.platform) {
          // Show meeting detected status
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

// Load saved auto-record setting with error handling
try {
  chrome.storage.local.get(['autoRecord'], (data) => {
    if (chrome.runtime.lastError) {
      console.error('[Meeting Recorder] Storage read error:', chrome.runtime.lastError);
      return;
    }

    if (autoRecordCheckbox) {
      autoRecordCheckbox.checked = data.autoRecord === true;
    }
  });
} catch (error) {
  console.error('[Meeting Recorder] Failed to load auto-record setting:', error);
}

// Save auto-record setting when changed
if (autoRecordCheckbox) {
  autoRecordCheckbox.addEventListener('change', () => {
    try {
      chrome.storage.local.set({ autoRecord: autoRecordCheckbox.checked }, () => {
        if (chrome.runtime.lastError) {
          console.error('[Meeting Recorder] Storage write error:', chrome.runtime.lastError);
          alert('Failed to save auto-record setting');
          return;
        }
        console.log('[Meeting Recorder] Auto-record:', autoRecordCheckbox.checked);
      });
    } catch (error) {
      console.error('[Meeting Recorder] Failed to save auto-record setting:', error);
    }
  });
}