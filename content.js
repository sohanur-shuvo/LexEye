// content.js - Simple screen + audio recorder

console.log('[Meeting Recorder] Content script loaded');

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let mediaStream = null;
let audioContext = null;
let micStream = null;

// Meeting detection class
class MeetingDetector {
  constructor() {
    this.platform = this.detectPlatform();
    this.isInMeeting = false;
    this.checkInterval = null;
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

    // Then check every 3 seconds
    this.checkInterval = setInterval(() => {
      this.checkMeetingStatus();
    }, 3000);
  }

  checkMeetingStatus() {
    let inMeeting = false;

    switch(this.platform) {
      case 'teams':
        // Check for Teams call controls/interface
        inMeeting = !!(
          document.querySelector('[data-tid="callingButtons"]') ||
          document.querySelector('[data-tid="calling-screen"]') ||
          document.querySelector('.calling-screen') ||
          document.querySelector('[data-tid="meetingButtonsToolbar"]') ||
          document.querySelector('button[data-tid="call-hangup"]')
        );
        break;

      case 'meet':
        // Check for Google Meet call interface
        inMeeting = !!(
          document.querySelector('[data-meeting-title]') ||
          document.querySelector('[data-self-name]') ||
          document.querySelector('div[data-fps-request-screencast-cap]') ||
          document.querySelector('[data-participant-id]') ||
          document.querySelector('button[aria-label*="Leave call"]')
        );
        break;

      case 'zoom':
        // Check for Zoom meeting interface
        inMeeting = !!(
          document.querySelector('#wc-container') ||
          document.querySelector('.meeting-app') ||
          document.querySelector('[aria-label*="meeting"]') ||
          document.querySelector('.footer__leave-btn') ||
          document.querySelector('.zm-btn-legacy--danger')
        );
        break;
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

// Start recording function
async function startRecording() {
  try {
    console.log('[Meeting Recorder] Starting...');

    // Request screen + audio with high quality
    // IMPORTANT: Use preferCurrentTab to capture the meeting tab's audio
    // This captures BOTH meeting audio AND your voice as it goes through the meeting
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
      preferCurrentTab: true,  // Prefer capturing the current tab
      selfBrowserSurface: "include"  // Include current tab in selection
    });

    console.log('[Meeting Recorder] Got display media');

    // IMPORTANT: Request microphone audio separately
    // This is critical for capturing YOUR voice during the call
    let finalStream = mediaStream;
    let micCaptured = false;

    // Try to get microphone - THIS IS CRITICAL for capturing YOUR voice
    // The tab audio only captures OTHER participants, NOT you
    try {
      console.log('[Meeting Recorder] Requesting microphone access for YOUR voice...');

      // Request microphone with settings optimized for simultaneous use
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,  // Don't filter out - we need raw audio
          noiseSuppression: false,  // Keep all audio
          autoGainControl: false,   // Manual control is better
          sampleRate: 48000,
          channelCount: 2,
          // These settings help with simultaneous access
          googEchoCancellation: false,
          googAutoGainControl: false,
          googNoiseSuppression: false,
          googHighpassFilter: false
        }
      });

      micCaptured = true;
      console.log('[Meeting Recorder] ✓ Microphone captured successfully - YOUR voice will be recorded!');

      // Mix system audio + microphone using Web Audio API with high quality
      audioContext = new AudioContext({ sampleRate: 48000 });
      const destination = audioContext.createMediaStreamDestination();

      // Create gain nodes for volume control
      const systemGain = audioContext.createGain();
      const micGain = audioContext.createGain();

      // Set volumes (1.0 = 100%, can boost to 1.5 for 150%)
      systemGain.gain.value = 1.2; // Boost meeting audio slightly
      micGain.gain.value = 1.0; // Normal microphone volume

      // Add system audio (if shared)
      const systemAudioTracks = mediaStream.getAudioTracks();
      if (systemAudioTracks.length > 0) {
        console.log('[Meeting Recorder] Mixing system audio with gain');
        const systemSource = audioContext.createMediaStreamSource(
          new MediaStream(systemAudioTracks)
        );
        systemSource.connect(systemGain);
        systemGain.connect(destination);
      }

      // Add microphone audio
      console.log('[Meeting Recorder] Mixing microphone audio with gain');
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(micGain);
      micGain.connect(destination);

      // Create final stream with video + mixed audio
      finalStream = new MediaStream([
        ...mediaStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ]);

      console.log('[Meeting Recorder] ✓ Audio mixed successfully (system + microphone)');
    } catch (micError) {
      console.error('[Meeting Recorder] ✗ Microphone FAILED:', micError.message);
      console.error('[Meeting Recorder] Error details:', micError.name, micError.constraint);

      // Alert user with realistic solutions
      alert('⚠️ Cannot Access Microphone - YOUR VOICE WILL NOT BE RECORDED\n\n' +
            '❌ Problem: Microphone is already in use by the meeting\n' +
            '❌ Tab audio only records OTHER participants, NOT you\n\n' +
            '✅ SOLUTIONS TO RECORD YOUR VOICE:\n\n' +
            'Option 1: Start recording BEFORE joining the meeting\n' +
            '  - This extension will capture your mic first\n' +
            '  - Then join the meeting (mic access is shared)\n\n' +
            'Option 2: Use system audio (Windows only)\n' +
            '  - Select "Entire Screen" instead of tab\n' +
            '  - Check "Share system audio"\n' +
            '  - Enable "Listen to this device" in Windows sound settings\n\n' +
            'Option 3: Grant Chrome mic permission\n' +
            '  - Click the mic icon in address bar\n' +
            '  - Allow microphone for this site\n' +
            '  - Reload page and try again\n\n' +
            'Recording will continue with meeting audio only...');

      console.log('[Meeting Recorder] ⚠️ Recording WITHOUT your voice - only other participants will be captured');
    }

    // Setup recorder with high quality settings
    const options = {
      mimeType: 'video/webm;codecs=vp9,opus',
      videoBitsPerSecond: 5000000,  // 5 Mbps for video
      audioBitsPerSecond: 256000     // 256 kbps for audio (very high quality)
    };

    // Fallback to vp8 if vp9 not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.log('[Meeting Recorder] VP9 not supported, using VP8');
      options.mimeType = 'video/webm;codecs=vp8,opus';
    }

    mediaRecorder = new MediaRecorder(finalStream, options);
    recordedChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      saveRecording();
    };

    // Auto-stop when user stops sharing
    mediaStream.getVideoTracks()[0].onended = () => {
      console.log('[Meeting Recorder] Share stopped');
      stopRecording();
    };

    mediaRecorder.start(1000);
    isRecording = true;

    console.log('[Meeting Recorder] Recording started with high quality!');
    console.log('[Meeting Recorder] Microphone included:', micCaptured);
    console.log('[Meeting Recorder] System audio tracks:', mediaStream.getAudioTracks().length);

    // Notify user of successful recording start
    if (micCaptured) {
      chrome.runtime.sendMessage({
        type: 'RECORDING_STARTED'
      }).catch(() => {});
    }

    return { success: true, micCaptured: micCaptured };

  } catch (error) {
    console.error('[Meeting Recorder] Error:', error);
    return { success: false, error: error.message };
  }
}

// Stop recording function
function stopRecording() {
  if (!isRecording) {
    return { success: false };
  }

  console.log('[Meeting Recorder] Stopping...');

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
  }

  if (audioContext) {
    audioContext.close();
  }

  isRecording = false;
  mediaStream = null;
  micStream = null;
  audioContext = null;

  // Notify background
  chrome.runtime.sendMessage({ type: 'RECORDING_STOPPED' }).catch(() => {});

  return { success: true };
}

// Save recording function
function saveRecording() {
  console.log('[Meeting Recorder] Saving...');

  if (recordedChunks.length === 0) {
    alert('No recording data');
    return;
  }

  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().substring(0, 19).replace(/:/g, '-');
  const filename = `recording-${date}.webm`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
  recordedChunks = [];

  console.log('[Meeting Recorder] Saved:', filename);
  
  // Notify background
  chrome.runtime.sendMessage({ type: 'RECORDING_SAVED' }).catch(() => {});
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Meeting Recorder] Message:', message.type);

  if (message.type === 'START_RECORDING') {
    startRecording().then(sendResponse);
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    sendResponse(stopRecording());
    return false;
  }

  if (message.type === 'GET_STATUS' || message.type === 'GET_MEETING_STATUS') {
    const status = detector.getStatus();
    sendResponse({
      isRecording: isRecording,
      platform: status.platform,
      isInMeeting: status.isInMeeting
    });
    return false;
  }

  return false;
});