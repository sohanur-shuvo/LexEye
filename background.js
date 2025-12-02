// background.js - Enhanced recording coordinator with validation and state management

class RecordingManager {
    constructor() {
      this.isRecording = false;
      this.currentTabId = null;
      this.recordingStartTime = null;
      this.autoRecordTimeout = null;
      console.log('[Meeting Recorder] Background service initialized');

      // Restore state on startup
      this.restoreState();
    }

    async restoreState() {
      try {
        const state = await chrome.storage.local.get(['recordingState']);
        if (state.recordingState?.isRecording) {
          // Check if state is recent (within last 5 minutes)
          const age = Date.now() - (state.recordingState.timestamp || 0);
          if (age < 5 * 60 * 1000) {
            console.log('[Meeting Recorder] Found recent recording state, attempting recovery');
            this.isRecording = true;
            this.currentTabId = state.recordingState.tabId;
          } else {
            // Clear stale state
            await chrome.storage.local.remove(['recordingState']);
          }
        }
      } catch (err) {
        console.error('[Meeting Recorder] State restoration failed:', err);
      }
    }

    async startRecording(tabId) {
      try {
        // Validate input
        if (!tabId || typeof tabId !== 'number') {
          throw new Error('Invalid tab ID');
        }

        // Check if already recording
        if (this.isRecording) {
          console.warn('[Meeting Recorder] Already recording');
          return { success: false, error: 'Already recording' };
        }

        // Validate tab exists
        let tab;
        try {
          tab = await chrome.tabs.get(tabId);
        } catch (err) {
          throw new Error('Tab not found');
        }

        console.log('[Meeting Recorder] Starting recording for tab:', tabId);

        // Send message to content script to start recording
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'START_RECORDING'
        });

        if (response && response.success) {
          this.isRecording = true;
          this.currentTabId = tabId;
          this.recordingStartTime = Date.now();

          console.log('[Meeting Recorder] Recording started successfully');
          console.log('[Meeting Recorder] Microphone captured:', response.micCaptured);

          // Show notification based on microphone status
          const notificationMessage = response.micCaptured
            ? '✓ Recording screen + microphone audio'
            : '⚠️ Recording screen only (no microphone)';

          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Recording Started',
            message: notificationMessage,
            priority: 2
          });

          return { success: true, micCaptured: response.micCaptured };
        } else {
          throw new Error(response?.error || 'Failed to start recording');
        }

      } catch (error) {
        console.error('[Meeting Recorder] Recording start failed:', error);

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Recording Failed',
          message: error.message || 'Could not start recording',
          priority: 2
        });

        return { success: false, error: error.message };
      }
    }
  
    async stopRecording() {
      if (!this.isRecording || !this.currentTabId) {
        console.log('[Meeting Recorder] Not currently recording');
        return { success: false, error: 'Not recording' };
      }

      console.log('[Meeting Recorder] Stopping recording...');

      try {
        // Validate tab still exists
        try {
          await chrome.tabs.get(this.currentTabId);
        } catch (err) {
          console.warn('[Meeting Recorder] Tab no longer exists');
          // Continue anyway to clean up state
        }

        const response = await chrome.tabs.sendMessage(this.currentTabId, {
          type: 'STOP_RECORDING'
        });

        const duration = this.recordingStartTime
          ? Math.floor((Date.now() - this.recordingStartTime) / 1000)
          : 0;

        this.isRecording = false;
        this.currentTabId = null;
        this.recordingStartTime = null;

        console.log('[Meeting Recorder] Recording stopped, duration:', duration, 'seconds');

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Recording Stopped',
          message: 'Your recording is being saved...',
          priority: 2
        });

        return { success: true, duration };

      } catch (error) {
        console.error('[Meeting Recorder] Error stopping recording:', error);
        // Force cleanup even on error
        this.isRecording = false;
        this.currentTabId = null;
        this.recordingStartTime = null;
        return { success: false, error: error.message };
      }
    }

    getStatus() {
      return {
        isRecording: this.isRecording,
        tabId: this.currentTabId,
        duration: this.recordingStartTime
          ? Math.floor((Date.now() - this.recordingStartTime) / 1000)
          : 0
      };
    }
  }

  const recorder = new RecordingManager();

  // Listen for messages with enhanced validation
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Validate message format
    if (!message || typeof message.type !== 'string') {
      console.error('[Meeting Recorder] Invalid message:', message);
      sendResponse({ success: false, error: 'Invalid message format' });
      return false;
    }

    console.log('[Meeting Recorder] Message received:', message.type);

    try {
      switch(message.type) {
        case 'START_RECORDING':
          // Validate tabId provided
          if (!message.tabId) {
            sendResponse({ success: false, error: 'Tab ID required' });
            return false;
          }
          recorder.startRecording(message.tabId).then(sendResponse);
          return true; // Keep channel open

        case 'STOP_RECORDING':
          recorder.stopRecording().then(sendResponse);
          return true; // Keep channel open

        case 'GET_RECORDING_STATUS':
          sendResponse(recorder.getStatus());
          return false;

        case 'GET_TAB_ID':
          // Helper for content script to get its tab ID
          sendResponse({ tabId: sender.tab?.id });
          return false;

        case 'RECORDING_STARTED':
          // Notification from content script
          if (sender.tab?.id) {
            recorder.isRecording = true;
            recorder.currentTabId = sender.tab.id;
            recorder.recordingStartTime = Date.now();
            console.log('[Meeting Recorder] Recording confirmed started');
          }
          break;

        case 'RECORDING_STOPPED':
          // Notification from content script
          recorder.isRecording = false;
          recorder.currentTabId = null;
          recorder.recordingStartTime = null;
          console.log('[Meeting Recorder] Recording confirmed stopped');

          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Recording Stopped',
            message: 'Finalizing your recording...',
            priority: 2
          });
          break;

        case 'RECORDING_SAVED':
          console.log('[Meeting Recorder] Recording saved:', message.filename);

          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Recording Saved',
            message: `Saved: ${message.filename || 'recording.webm'}`,
            priority: 2
          });
          break;

        case 'RECORDING_FAILED':
          recorder.isRecording = false;
          recorder.currentTabId = null;
          recorder.recordingStartTime = null;
          console.error('[Meeting Recorder] Recording failed:', message.error);

          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Recording Failed',
            message: message.error || 'Recording failed',
            priority: 2
          });
          break;

        case 'MEETING_STATUS_CHANGED':
          // Validate sender
          if (!sender.tab?.id) {
            console.warn('[Meeting Recorder] Meeting status from unknown tab');
            break;
          }

          console.log('[Meeting Recorder] Meeting status:', {
            platform: message.platform,
            isInMeeting: message.isInMeeting,
            tabId: sender.tab.id
          });

          // Handle auto-record with improved timing
          chrome.storage.local.get(['autoRecord'], async (data) => {
            if (data.autoRecord !== true) {
              return;
            }

            // Clear any pending timeout
            if (recorder.autoRecordTimeout) {
              clearTimeout(recorder.autoRecordTimeout);
              recorder.autoRecordTimeout = null;
            }

            if (message.isInMeeting && !recorder.isRecording) {
              console.log('[Meeting Recorder] Scheduling auto-start...');

              // Wait for meeting to stabilize before starting
              // Check meeting is still active before actually starting
              recorder.autoRecordTimeout = setTimeout(async () => {
                try {
                  // Verify tab still exists and is in meeting
                  const tab = await chrome.tabs.get(sender.tab.id);
                  const response = await chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'GET_MEETING_STATUS'
                  });

                  if (response?.isInMeeting && !recorder.isRecording) {
                    console.log('[Meeting Recorder] Auto-starting recording');
                    await recorder.startRecording(sender.tab.id);
                  } else {
                    console.log('[Meeting Recorder] Auto-start cancelled - meeting ended');
                  }
                } catch (err) {
                  console.error('[Meeting Recorder] Auto-start failed:', err);
                }
                recorder.autoRecordTimeout = null;
              }, 3000); // 3 second delay for stability

            } else if (!message.isInMeeting && recorder.isRecording && recorder.currentTabId === sender.tab.id) {
              console.log('[Meeting Recorder] Auto-stopping recording');
              await recorder.stopRecording();
            }
          });
          break;

        default:
          console.warn('[Meeting Recorder] Unknown message type:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
          return false;
      }

    } catch (error) {
      console.error('[Meeting Recorder] Message handler error:', error);
      sendResponse({ success: false, error: error.message });
      return false;
    }

    return true;
  });