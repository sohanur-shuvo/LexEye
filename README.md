# LexEye - Meeting Recorder Extension

A Chrome browser extension that automatically records online meetings from Microsoft Teams, Google Meet, and Zoom with high-quality video and audio capture.

## Features

- **Automatic Meeting Detection** - Detects when you join or leave meetings on supported platforms
- **Smart Auto-Recording** - Optionally start recording automatically when a meeting begins
- **High-Quality Recording** - Captures at 1920x1080 resolution, 30fps, with VP9/VP8 codec
- **Audio Mixing** - Combines meeting audio with microphone input seamlessly
- **One-Click Control** - Simple start/stop recording from browser toolbar
- **Desktop Notifications** - Real-time status updates about recording progress
- **Local Processing** - All recording happens locally, no data sent to external servers
- **WebM Output** - Saves recordings directly to your Downloads folder

## Supported Platforms

- Microsoft Teams (teams.microsoft.com)
- Google Meet (meet.google.com)
- Zoom (zoom.us)

## Installation

### Chrome Web Store (Recommended)
*Coming soon - Extension pending review*

### Manual Installation (Developer Mode)

1. **Download the Extension**
   ```bash
   git clone https://github.com/yourusername/lexeye.git
   ```
   Or download the ZIP and extract it.

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or click Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `LexEye` folder
   - The extension icon should appear in your toolbar

### For Microsoft Edge

The extension also works on Microsoft Edge (Chromium-based):
- Navigate to `edge://extensions/`
- Follow the same steps as Chrome

## Usage

### Manual Recording - IMPORTANT: Read This to Record Your Voice!

**Critical:** Tab audio captures OTHER participants, NOT your voice. Here's how to record YOUR voice:

#### Method 1: Start Recording BEFORE Joining (Recommended)
1. Open the meeting link (but don't join yet)
2. Click the LexEye extension icon
3. Click **"Start Recording"**
4. Grant microphone access when prompted (MUST accept!)
5. Select "Chrome Tab" + check "Share tab audio"
6. NOW join the meeting
7. Both your voice AND others will be recorded

**Why this works:** The extension captures your mic first, then the meeting shares access.

#### Method 2: If Already in Meeting (May Not Work)
1. Browser might block mic access (already in use)
2. Try anyway: Click "Start Recording"
3. If mic permission fails, you'll only record OTHER people
4. For best results, restart and use Method 1

#### Method 3: System Audio (Windows Only)
1. Windows Sound Settings → Recording → Stereo Mix → Enable → "Listen to this device"
2. Click "Start Recording"
3. Select **"Entire Screen"** (not tab)
4. Check **"Share system audio"**
5. This captures everything your speakers play, including your voice echo

### Auto-Recording Mode

1. Click the LexEye extension icon
2. Check the **"Auto-record meetings"** checkbox
3. Recordings will start automatically when you join a meeting
4. Recordings stop automatically when you leave the meeting

### Viewing Status

The extension popup shows:
- **Idle** - Not in a meeting, not recording
- **In Meeting** - Meeting detected, ready to record
- **Recording** - Currently recording (blinking indicator)

## Permissions Explained

LexEye requests the following permissions for legitimate functionality:

| Permission | Purpose |
|------------|---------|
| `tabCapture` | Required to capture video and audio from meeting tabs |
| `storage` | Saves your auto-record preference |
| `notifications` | Shows desktop alerts when recording starts/stops |
| `activeTab` | Detects which tab you're viewing |
| `downloads` | Saves recorded videos to your Downloads folder |
| Host permissions | Limited access to Teams, Meet, and Zoom domains only |

**Privacy:** LexEye does not send any data to external servers. All recording and processing happens locally on your machine.

## How It Works

1. **Detection** - Content script monitors the DOM to detect when you join a meeting
2. **Capture** - Uses `getDisplayMedia()` API to capture screen and system audio
3. **Mixing** - Web Audio API mixes meeting audio with microphone input (if available)
4. **Recording** - MediaRecorder API encodes video/audio to WebM format
5. **Saving** - Downloads API saves the file locally

## Technical Details

- **Manifest Version:** V3 (Modern Chrome extension architecture)
- **Video Codec:** VP9/VP8
- **Audio Codec:** Opus (256 kbps)
- **Video Bitrate:** 5 Mbps
- **Audio Mixing:** Adjustable gain (1.2x system audio, 1.0x microphone)
- **Output Format:** WebM container

## Project Structure

```
LexEye/
├── manifest.json       # Extension configuration
├── background.js       # Background service worker
├── content.js          # Meeting detection and recording logic
├── popup.html          # Extension popup UI
├── popup.js            # Popup controller
├── debug.html          # Debug interface
└── icons/              # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Development

### Prerequisites
- Google Chrome or Microsoft Edge (Chromium-based)
- Basic knowledge of JavaScript and Chrome Extension APIs

### Local Development

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/lexeye.git
   cd lexeye
   ```

2. Load the extension in Chrome (see Installation instructions above)

3. Make your changes to the source files

4. Reload the extension:
   - Go to `chrome://extensions/`
   - Click the refresh icon on the LexEye card

### Debug Mode

Open `debug.html` in your browser for a debugging interface that shows:
- Extension status
- Meeting detection status
- Recording status
- Auto-record settings
- Real-time console logs

## Troubleshooting

### My voice is not being recorded (MOST COMMON ISSUE)

**Root Cause:** Your microphone is already in use by the meeting, so the extension can't access it.

**Solutions (in order of reliability):**

1. **Start recording BEFORE joining the meeting** (Best method)
   - Open meeting link but don't join
   - Start recording and grant microphone permission
   - Then join the meeting
   - Both your mic and meeting audio will be captured

2. **Check browser permissions**
   - Go to `chrome://settings/content/microphone`
   - Ensure Teams/Meet/Zoom is allowed
   - Reload the page and try again

3. **Use system audio capture (Windows)**
   - Enable "Stereo Mix" in Windows sound settings
   - Enable "Listen to this device" for your microphone
   - Select "Entire Screen" + "Share system audio"
   - Your voice echo will be captured

4. **Last resort: Use meeting's built-in recording**
   - Teams, Meet, and Zoom all have native recording
   - This is more reliable for capturing all participants

### Recording doesn't start
- Ensure you've granted screen sharing permission
- Make sure you selected the correct meeting tab/window
- Check that you're on a supported platform (Teams, Meet, or Zoom)

### No audio at all in recording
- Verify you checked "Share tab audio" when selecting what to share
- Check your system audio settings
- Ensure the meeting audio is not muted
- Try recording again and carefully select "Chrome Tab" + "Share tab audio"

### Extension icon doesn't appear
- Verify Developer Mode is enabled
- Check that all files are present in the directory
- Look for errors in `chrome://extensions/`

## Browser Compatibility

- Google Chrome 88+
- Microsoft Edge 88+ (Chromium-based)
- Other Chromium-based browsers (Brave, Opera, Vivaldi)

**Note:** Firefox uses a different extension API (WebExtensions) and is not currently supported.

## Legal & Compliance

**Important:** Always obtain consent before recording meetings. Many jurisdictions require all parties to be informed and consent to recording. It is your responsibility to:

- Check your local laws regarding recording conversations
- Inform all meeting participants that recording is taking place
- Comply with your organization's policies
- Respect others' privacy rights

The developers of LexEye are not responsible for misuse of this software.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built using Chrome Extension Manifest V3
- Uses Web Audio API for audio mixing
- MediaRecorder API for video encoding

## Support

If you encounter issues or have questions:
- Open an issue on [GitHub Issues](https://github.com/yourusername/lexeye/issues)
- Check existing issues for solutions
- Provide detailed information about your problem (browser version, OS, error messages)

---

**Disclaimer:** This extension is provided as-is for legitimate use cases. Users are responsible for ensuring their use complies with applicable laws and platform terms of service.
