// content.js - Enhanced screen + audio recorder with robust detection

console.log('[Meeting Recorder] Content script loaded');

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let mediaStream = null;
let audioContext = null;
let micStream = null;
let saveInterval = null; // For chunked saving

// State recovery on load
(async function recoverState() {
  try {
    const state = await chrome.storage.local.get(['recordingState']);
    if (state.recordingState?.isRecording && state.recordingState?.tabId === await getCurrentTabId()) {
      console.log('[Meeting Recorder] Recovering from crash - state was recording');
      // Clear stale state
      await chrome.storage.local.remove(['recordingState']);
    }
  } catch (err) {
    console.error('[Meeting Recorder] State recovery failed:', err);
  }
})();

async function getCurrentTabId() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_ID' });
    return response?.tabId;
  } catch {
    return null;
  }
}

// Meeting detection class with MutationObserver
class MeetingDetector {
  constructor() {
    this.platform = this.detectPlatform();
    this.isInMeeting = false;
    this.checkInterval = null;
    this.observer = null;
    this.lastCheckTime = 0;
    this.checkDebounceMs = 1000; // Debounce rapid checks
    console.log('[Meeting Recorder] Platform detected:', this.platform);
  }

  detectPlatform() {
    const url = window.location.hostname;
    if (url.includes('teams.microsoft.com')) return 'teams';
    if (url.includes('meet.google.com')) return 'meet';
    if (url.includes('zoom.us')) return 'zoom';
    return null;
  }

  startDetection() {
    if (!this.platform) {
      console.log('[Meeting Recorder] Not on a meeting platform');
      return;
    }

    console.log('[Meeting Recorder] Starting detection for:', this.platform);

    // Check immediately
    this.checkMeetingStatus();

    // Use MutationObserver for real-time detection
    this.setupMutationObserver();

    // Fallback polling every 5 seconds (less aggressive)
    this.checkInterval = setInterval(() => {
      this.checkMeetingStatus();
    }, 5000);
  }

  setupMutationObserver() {
    // Observe DOM changes for meeting UI elements
    this.observer = new MutationObserver(() => {
      const now = Date.now();
      if (now - this.lastCheckTime > this.checkDebounceMs) {
        this.lastCheckTime = now;
        this.checkMeetingStatus();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-tid', 'aria-label']
    });
  }

  checkMeetingStatus() {
    let inMeeting = false;

    try {
      switch (this.platform) {
        case 'teams':
          // Multiple fallback selectors for Teams
          inMeeting = !!(
            // Primary selectors
            document.querySelector('[data-tid="callingButtons"]') ||
            document.querySelector('[data-tid="calling-screen"]') ||
            document.querySelector('[data-tid="meetingButtonsToolbar"]') ||
            document.querySelector('button[data-tid="call-hangup"]') ||
            // Fallback selectors
            document.querySelector('.calling-screen') ||
            document.querySelector('[data-tid="controls-call-leave"]') ||
            document.querySelector('[data-tid="calling-join-button"]')?.closest('.calling-screen') ||
            // Generic fallbacks
            (document.querySelector('[id*="calling"]') && document.querySelector('[class*="call"]'))
          );
          break;

        case 'meet':
          // Multiple fallback selectors for Google Meet
          inMeeting = !!(
            // Primary selectors
            document.querySelector('[data-meeting-title]') ||
            document.querySelector('[data-self-name]') ||
            document.querySelector('button[aria-label*="Leave call"]') ||
            document.querySelector('button[aria-label*="End call"]') ||
            // Fallback selectors
            document.querySelector('[data-fps-request-screencast-cap]') ||
            document.querySelector('[data-participant-id]') ||
            document.querySelector('div[jsname][data-meeting-code]') ||
            // Generic fallbacks
            (document.querySelector('[jscontroller]') && window.location.pathname !== '/')
          );
          break;

        case 'zoom':
          // Multiple fallback selectors for Zoom
          inMeeting = !!(
            // Primary selectors
            document.querySelector('#wc-container') ||
            document.querySelector('.meeting-app') ||
            document.querySelector('.footer__leave-btn') ||
            document.querySelector('button[aria-label*="End"]') ||
            // Fallback selectors
            document.querySelector('[aria-label*="meeting"]') ||
            document.querySelector('.zm-btn-legacy--danger') ||
            document.querySelector('.meeting-client') ||
            // Generic fallbacks
            (document.querySelector('.footer-button__wrapper') && document.querySelector('[class*="video"]'))
          );
          break;
      }
    } catch (err) {
      console.error('[Meeting Recorder] Error checking meeting status:', err);
      // On error, don't change state
      return;
    }

    // Only notify if status changed
    if (inMeeting !== this.isInMeeting) {
      this.isInMeeting = inMeeting;
      this.notifyStatusChange();
    }
  }

  notifyStatusChange() {
    console.log('[Meeting Recorder] Meeting status changed:', {
      platform: this.platform,
      isInMeeting: this.isInMeeting
    });

    chrome.runtime.sendMessage({
      type: 'MEETING_STATUS_CHANGED',
      platform: this.platform,
      isInMeeting: this.isInMeeting,
      url: window.location.href
    }).catch(err => {
      console.log('[Meeting Recorder] Failed to notify background:', err.message);
    });
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  getStatus() {
    return {
      platform: this.platform,
      isInMeeting: this.isInMeeting
    };
  }
}

// Initialize detector
const detector = new MeetingDetector();
if (detector.platform) {
  detector.startDetection();
}

// Start recording function with retry logic and state persistence
async function startRecording() {
  try {
    console.log('[Meeting Recorder] Starting...');

    // Validate not already recording
    if (isRecording) {
      console.warn('[Meeting Recorder] Already recording');
      return { success: false, error: 'Already recording' };
    }

    // Request screen + audio with high quality
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 2
      },
      preferCurrentTab: true,
      selfBrowserSurface: "include"
    });

    // Validate we got the stream
    if (!mediaStream || mediaStream.getTracks().length === 0) {
      throw new Error('Failed to capture display media');
    }

    console.log('[Meeting Recorder] Got display media');

    // Try microphone capture with retry logic
    let finalStream = mediaStream;
    let micCaptured = false;
    const maxMicRetries = 2;

    for (let attempt = 0; attempt < maxMicRetries; attempt++) {
      try {
        console.log(`[Meeting Recorder] Microphone attempt ${attempt + 1}/${maxMicRetries}...`);

        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 48000,
            channelCount: 2,
            googEchoCancellation: false,
            googAutoGainControl: false,
            googNoiseSuppression: false,
            googHighpassFilter: false
          }
        });

        micCaptured = true;
        console.log('[Meeting Recorder] ✓ Microphone captured successfully!');
        break;
      } catch (micError) {
        console.error(`[Meeting Recorder] Microphone attempt ${attempt + 1} failed:`, micError.message);
        if (attempt < maxMicRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
        }
      }
    }

    // Mix audio if microphone captured
    if (micCaptured && micStream) {
      try {
        audioContext = new AudioContext({ sampleRate: 48000 });
        const destination = audioContext.createMediaStreamDestination();

        const systemGain = audioContext.createGain();
        const micGain = audioContext.createGain();

        systemGain.gain.value = 1.2;
        micGain.gain.value = 1.0;

        const systemAudioTracks = mediaStream.getAudioTracks();
        if (systemAudioTracks.length > 0) {
          const systemSource = audioContext.createMediaStreamSource(
            new MediaStream(systemAudioTracks)
          );
          systemSource.connect(systemGain);
          systemGain.connect(destination);
        }

        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(micGain);
        micGain.connect(destination);

        finalStream = new MediaStream([
          ...mediaStream.getVideoTracks(),
          ...destination.stream.getAudioTracks()
        ]);

        console.log('[Meeting Recorder] ✓ Audio mixed successfully');
      } catch (mixError) {
        console.error('[Meeting Recorder] Audio mixing failed:', mixError);
        // Continue with unmixed stream
      }
    } else {
      console.warn('[Meeting Recorder] ⚠️ Recording WITHOUT microphone');
    }

    // Setup recorder with high quality settings
    const options = {
      mimeType: 'video/webm;codecs=vp9,opus',
      videoBitsPerSecond: 5000000,
      audioBitsPerSecond: 256000
    };

    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.log('[Meeting Recorder] VP9 not supported, using VP8');
      options.mimeType = 'video/webm;codecs=vp8,opus';
    }

    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      throw new Error('No supported video codec available');
    }

    mediaRecorder = new MediaRecorder(finalStream, options);
    recordedChunks = [];

    // Chunked data handling for memory efficiency
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);

        // Auto-save chunks if buffer gets too large (>500MB in chunks)
        const totalSize = recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
        if (totalSize > 500 * 1024 * 1024) {
          console.warn('[Meeting Recorder] Buffer size exceeds 500MB, consider stopping recording');
        }
      }
    };

    mediaRecorder.onstop = () => {
      saveRecording();
    };

    mediaRecorder.onerror = (event) => {
      console.error('[Meeting Recorder] MediaRecorder error:', event.error);
      stopRecording();
    };

    // Auto-stop when user stops sharing
    const videoTrack = mediaStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        console.log('[Meeting Recorder] Share stopped');
        stopRecording();
      };
    }

    // Start recording with 1 second timeslices
    mediaRecorder.start(1000);
    isRecording = true;

    // Persist state for recovery
    await saveRecordingState(true);

    console.log('[Meeting Recorder] Recording started successfully!');
    console.log('[Meeting Recorder] Microphone:', micCaptured);
    console.log('[Meeting Recorder] Audio tracks:', mediaStream.getAudioTracks().length);

    chrome.runtime.sendMessage({
      type: 'RECORDING_STARTED',
      micCaptured
    }).catch(() => { });

    return { success: true, micCaptured };

  } catch (error) {
    console.error('[Meeting Recorder] Start failed:', error);

    // Cleanup on failure
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext) {
      audioContext.close();
    }

    mediaStream = null;
    micStream = null;
    audioContext = null;

    return { success: false, error: error.message };
  }
}

// Save recording state for crash recovery
async function saveRecordingState(recording) {
  try {
    const tabId = await getCurrentTabId();
    await chrome.storage.local.set({
      recordingState: {
        isRecording: recording,
        tabId: tabId,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.error('[Meeting Recorder] Failed to save state:', err);
  }
}

// Stop recording function with proper cleanup
async function stopRecording() {
  if (!isRecording) {
    console.warn('[Meeting Recorder] Not currently recording');
    return { success: false, error: 'Not recording' };
  }

  console.log('[Meeting Recorder] Stopping...');

  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (err) {
          console.error('[Meeting Recorder] Error stopping track:', err);
        }
      });
    }

    if (micStream) {
      micStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (err) {
          console.error('[Meeting Recorder] Error stopping mic track:', err);
        }
      });
    }

    if (audioContext && audioContext.state !== 'closed') {
      await audioContext.close();
    }

    isRecording = false;
    mediaStream = null;
    micStream = null;
    audioContext = null;

    // Clear persisted state
    await saveRecordingState(false);

    chrome.runtime.sendMessage({ type: 'RECORDING_STOPPED' }).catch(() => { });

    return { success: true };
  } catch (error) {
    console.error('[Meeting Recorder] Error during stop:', error);
    // Force cleanup even on error
    isRecording = false;
    mediaStream = null;
    micStream = null;
    audioContext = null;
    return { success: false, error: error.message };
  }
}

// Save recording function with API upload to MeetingMuse
async function saveRecording() {
  console.log('[Meeting Recorder] Saving...');

  try {
    if (!recordedChunks || recordedChunks.length === 0) {
      console.error('[Meeting Recorder] No recording data to save');
      chrome.runtime.sendMessage({
        type: 'RECORDING_FAILED',
        error: 'No data recorded'
      }).catch(() => { });
      return;
    }

    const totalSize = recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    console.log(`[Meeting Recorder] Saving ${recordedChunks.length} chunks, ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    const blob = new Blob(recordedChunks, { type: 'video/webm' });

    // Validate blob
    if (blob.size === 0) {
      throw new Error('Recording blob is empty');
    }

    const date = new Date().toISOString().substring(0, 19).replace(/:/g, '-');
    const platform = detector?.platform || 'meeting';
    const filename = `${platform}-recording-${date}.webm`;

    // 1. Save locally as backup (original behavior)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up blob URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    console.log('[Meeting Recorder] ✓ Saved locally:', filename);

    // 2. Upload to MeetingMuse backend
    try {
      await uploadToMeetingMuse(blob, filename, platform);
    } catch (uploadError) {
      console.error('[Meeting Recorder] Upload to MeetingMuse failed:', uploadError);
      // Don't fail the whole save operation if upload fails
      chrome.runtime.sendMessage({
        type: 'UPLOAD_FAILED',
        error: uploadError.message,
        filename
      }).catch(() => { });
    }

    recordedChunks = [];

    chrome.runtime.sendMessage({
      type: 'RECORDING_SAVED',
      filename,
      size: blob.size
    }).catch(() => { });

  } catch (error) {
    console.error('[Meeting Recorder] Save failed:', error);
    chrome.runtime.sendMessage({
      type: 'RECORDING_FAILED',
      error: error.message
    }).catch(() => { });

    // Don't clear chunks on error - user might retry
  }
}

// Upload recording to MeetingMuse backend
async function uploadToMeetingMuse(blob, filename, platform) {
  console.log('[Meeting Recorder] Uploading to MeetingMuse...');

  // Get API configuration from storage
  const config = await chrome.storage.local.get([
    'meetingMuseApiUrl',
    'meetingMuseApiKey',
    'meetingMuseUserId',
    'autoUpload'
  ]);

  // Check if auto-upload is enabled
  if (config.autoUpload === false) {
    console.log('[Meeting Recorder] Auto-upload disabled, skipping');
    return;
  }

  const apiUrl = config.meetingMuseApiUrl || 'http://localhost:5000/api/external/receive-recording';
  const apiKey = config.meetingMuseApiKey || '';
  const userId = config.meetingMuseUserId || '';

  if (!apiKey) {
    console.warn('[Meeting Recorder] No API key configured, skipping upload');
    console.log('[Meeting Recorder] Configure in extension settings');
    return;
  }

  // Show upload notification
  chrome.runtime.sendMessage({
    type: 'UPLOAD_STARTED',
    filename
  }).catch(() => { });

  try {
    // Convert blob to base64
    const base64Video = await blobToBase64(blob);

    // Prepare API payload
    const payload = {
      video: base64Video,
      fileName: filename,
      title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Meeting - ${new Date().toLocaleString()}`,
      userId: userId,
      metadata: {
        platform: platform,
        recordedAt: new Date().toISOString(),
        duration: Math.floor((Date.now() - (window.recordingStartTime || Date.now())) / 1000),
        source: 'lexeye-extension',
        fileSize: blob.size
      }
    };

    // Send to MeetingMuse API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}` // Send as Bearer token
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[Meeting Recorder] ✓ Uploaded to MeetingMuse successfully!', result);

    // Show success notification
    chrome.runtime.sendMessage({
      type: 'UPLOAD_SUCCESS',
      filename,
      meetingId: result.meetingId || result.id
    }).catch(() => { });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Uploaded to MeetingMuse',
      message: `${filename} is being processed by AI`,
      priority: 2
    });

  } catch (error) {
    console.error('[Meeting Recorder] Upload error:', error);
    throw error;
  }
}

// Helper function to convert Blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Remove data URL prefix (data:video/webm;base64,)
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Listen for messages from popup/background with validation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate message
  if (!message || typeof message.type !== 'string') {
    console.error('[Meeting Recorder] Invalid message received:', message);
    sendResponse({ success: false, error: 'Invalid message format' });
    return false;
  }

  console.log('[Meeting Recorder] Message:', message.type);

  try {
    switch (message.type) {
      case 'START_RECORDING':
        startRecording().then(sendResponse).catch(err => {
          console.error('[Meeting Recorder] Start recording error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true; // Keep channel open for async response

      case 'STOP_RECORDING':
        stopRecording().then(sendResponse).catch(err => {
          console.error('[Meeting Recorder] Stop recording error:', err);
          sendResponse({ success: false, error: err.message });
        });
        return true; // Keep channel open for async response

      case 'GET_STATUS':
      case 'GET_MEETING_STATUS':
        const status = detector?.getStatus() || { platform: null, isInMeeting: false };
        sendResponse({
          isRecording: isRecording,
          platform: status.platform,
          isInMeeting: status.isInMeeting
        });
        return false;

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
});