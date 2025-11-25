// background.js - Simplified recording coordinator

class RecordingManager {
    constructor() {
      this.isRecording = false;
      this.currentTabId = null;
      console.log('[Meeting Recorder] Background service initialized');
    }
  
    async startRecording(tabId) {
      try {
        console.log('[Meeting Recorder] Starting recording for tab:', tabId);
  
        // Send message to content script to start recording
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'START_RECORDING'
        });
  
        if (response && response.success) {
          this.isRecording = true;
          this.currentTabId = tabId;

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
        return { success: false };
      }
  
      console.log('[Meeting Recorder] Stopping recording...');
      
      try {
        const response = await chrome.tabs.sendMessage(this.currentTabId, {
          type: 'STOP_RECORDING'
        });
  
        this.isRecording = false;
        this.currentTabId = null;
  
        console.log('[Meeting Recorder] Recording stopped');
  
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Recording Stopped',
          message: 'Your recording is being saved...',
          priority: 2
        });
  
        return { success: true };
  
      } catch (error) {
        console.error('[Meeting Recorder] Error stopping recording:', error);
        this.isRecording = false;
        this.currentTabId = null;
        return { success: false, error: error.message };
      }
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
    console.log('[Meeting Recorder] Message received:', message.type);
    
    switch(message.type) {
      case 'START_RECORDING':
        recorder.startRecording(message.tabId).then(sendResponse);
        return true; // Keep channel open
  
      case 'STOP_RECORDING':
        recorder.stopRecording().then(sendResponse);
        return true; // Keep channel open
  
      case 'GET_RECORDING_STATUS':
        sendResponse(recorder.getStatus());
        break;
  
      case 'RECORDING_STARTED':
        // Notification from content script
        recorder.isRecording = true;
        recorder.currentTabId = sender.tab?.id;
        console.log('[Meeting Recorder] Recording confirmed started');
        break;
  
      case 'RECORDING_STOPPED':
        // Notification from content script
        recorder.isRecording = false;
        recorder.currentTabId = null;
        console.log('[Meeting Recorder] Recording confirmed stopped');
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Recording Saved',
          message: 'Your meeting recording has been saved to Downloads',
          priority: 2
        });
        break;
  
      case 'RECORDING_FAILED':
        recorder.isRecording = false;
        recorder.currentTabId = null;
        console.error('[Meeting Recorder] Recording failed:', message.error);
        break;
  
      case 'MEETING_STATUS_CHANGED':
        console.log('[Meeting Recorder] Meeting status:', {
          platform: message.platform,
          isInMeeting: message.isInMeeting
        });
        
        // Handle auto-record
        chrome.storage.local.get(['autoRecord'], (data) => {
          if (data.autoRecord === true) {
            if (message.isInMeeting && !recorder.isRecording) {
              console.log('[Meeting Recorder] Auto-starting recording...');
              setTimeout(() => {
                recorder.startRecording(sender.tab.id);
              }, 2000); // Wait 2 seconds before auto-start
            } else if (!message.isInMeeting && recorder.isRecording) {
              console.log('[Meeting Recorder] Auto-stopping recording...');
              recorder.stopRecording();
            }
          }
        });
        break;
    }
    
    return true;
  });