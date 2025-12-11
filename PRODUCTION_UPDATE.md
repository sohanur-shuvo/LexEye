# LexEye Extension - Production Update

## Updated Files

### 1. `manifest.json`
- ✅ Added host permissions for production Render URLs:
  - `https://meetingmuse-backend.onrender.com/*`
  - `https://meetingmuse-frontend.onrender.com/*`
  - `http://localhost:8080/*` (for local development)
- Kept localhost permissions for backward compatibility

### 2. `content.js`
- ✅ Updated default API URL (line 573):
  - **Before**: `http://localhost:5000/api/external/receive-recording`
  - **After**: `https://meetingmuse-backend.onrender.com/api/external/receive-recording`

### 3. `popup-new.js`
- ✅ Updated authentication endpoint (line 72)
- ✅ Updated web token query to support both production and localhost (line 89)
- ✅ Updated API configuration for auto-upload (lines 126, 208)
- ✅ Updated login endpoint (line 180)
- ✅ Updated Google login redirect URL (line 228)

## URLs Configuration

| Purpose | URL |
|---------|-----|
| **Frontend (Web App)** | https://meetingmuse-frontend.onrender.com |
| **Backend API** | https://meetingmuse-backend.onrender.com |
| **Auth Endpoint** | https://meetingmuse-backend.onrender.com/api/auth/me |
| **Login Endpoint** | https://meetingmuse-backend.onrender.com/api/auth/login |
| **Recording Upload** | https://meetingmuse-backend.onrender.com/api/external/receive-recording |

## How to Test the Extension

### Step 1: Reload the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked" and select the `LexEye` folder
4. OR if already loaded, click the reload icon on the extension card

### Step 2: Test Authentication
1. Click the extension icon in your browser toolbar
2. Try logging in with your MeetingMuse credentials:
   - **Option A**: Direct email/password login
   - **Option B**: Click "Login with Google" (opens production website)
3. After login, the extension should store your token

### Step 3: Test Recording
1. Navigate to a meeting platform:
   - Microsoft Teams
   - Google Meet
   - Zoom
2. Join or start a meeting
3. Click the extension icon
4. Click "Start Recording"
5. The recording should:
   - ✅ Capture screen and audio
   - ✅ Save locally as backup
   - ✅ Upload to your production backend at Render

### Step 4: Verify Upload
1. After stopping the recording, check:
   - Local Downloads folder (backup copy)
   - Your MeetingMuse dashboard at https://meetingmuse-frontend.onrender.com
2. The recording should appear in your meetings list

## Features Retained

- ✅ **Auto-detection**: Automatically detects when you're in a meeting
- ✅ **Auto-record**: Optional setting to start recording automatically
- ✅ **Dual audio**: Captures both system audio and microphone (if available)
- ✅ **Backup save**: Always saves locally before uploading
- ✅ **Firebase auth**: Seamless authentication with your MeetingMuse account
- ✅ **Cross-platform**: Works with Teams, Meet, and Zoom

## Backward Compatibility

The extension still supports localhost development:
- `http://localhost:8080` (frontend)
- `http://localhost:5000` (backend)

This means you can develop locally while the extension works with production.

## Troubleshooting

### Issue: "Login failed"
- **Solution**: Ensure your production backend is running on Render
- Check CORS settings in backend to allow extension requests

### Issue: "Upload failed"
- **Solution**: Verify the API endpoint is accessible
- Check network tab for CORS or authentication errors
- Ensure Firebase token is valid

### Issue: "Cannot read localStorage"
- **Solution**: Make sure you're logged in to the web app first
- The extension can sync credentials from an open MeetingMuse tab

### Issue: "Recording starts but doesn't upload"
- **Solution**: Check the browser console for errors
- Verify your API key is stored correctly in extension storage
- Go to `chrome://extensions/` → Details → Inspect views: service worker

## Next Steps

1. **Package for Distribution** (optional):
   ```bash
   # Zip the LexEye folder
   7z a LexEye-Extension.zip LexEye\*
   ```

2. **Publish to Chrome Web Store** (optional):
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Upload the zipped extension
   - Fill in store listing details

3. **Share with Users**:
   - Send them the LexEye folder
   - Provide installation instructions
   - They load it as an unpacked extension

## Security Notes

⚠️ **Important**: The Firebase config is hardcoded in `popup-new.js`. This is acceptable for client-side code, but ensure:
- Firebase authentication rules are properly configured
- API keys are restricted to your domains in Firebase console
- Backend validates all tokens before processing uploads

---

**Last Updated**: December 11, 2025
**Extension Version**: 1.0.0
**Production Status**: ✅ Ready for Render deployment
