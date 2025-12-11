# Quick Update Guide - LexEye Extension

## What Changed?

The LexEye extension has been updated to work with your **production MeetingMuse deployment on Render**:

- ✅ Frontend: https://meetingmuse-frontend.onrender.com
- ✅ Backend: https://meetingmuse-backend.onrender.com

## How to Update the Extension

### If You Already Have LexEye Installed:

1. **Reload the Extension**
   - Open Chrome and go to `chrome://extensions/`
   - Find "Meeting Recorder" (LexEye)
   - Click the **reload icon** (circular arrow)

2. **Verify Update**
   - Click the extension icon
   - You should see the login screen
   - The extension is now connected to production!

### If You Haven't Installed LexEye Yet:

1. **Load Extension**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **"Developer mode"** (toggle in top-right)
   - Click **"Load unpacked"**
   - Select the `LexEye` folder from:
     ```
     c:\Users\USER\Documents\Meowject\meetingmuse\LexEye
     ```

2. **Pin to Toolbar**
   - Click the puzzle icon in Chrome toolbar
   - Find "Meeting Recorder"
   - Click the pin icon to keep it visible

## Testing the Update

### Test 1: Login
1. Click the extension icon
2. Login options should appear:
   - **Email/Password**: Enter your MeetingMuse credentials
   - **Login with Google**: Opens production web app

### Test 2: Check Permissions
1. The extension should request permissions for:
   - meetingmuse-backend.onrender.com
   - meetingmuse-frontend.onrender.com
2. Click "Allow" when prompted

### Test 3: Record & Upload
1. Go to teams.microsoft.com or meet.google.com
2. Join a test meeting
3. Click extension → **Start Recording**
4. Record for 30 seconds
5. Click **Stop Recording**
6. Check:
   - ✅ File downloads locally
   - ✅ Upload notification appears
   - ✅ Recording appears in MeetingMuse dashboard

## Deployment Checklist

Before sharing with users, ensure:

- [ ] Backend is deployed on Render and accessible
- [ ] Frontend is deployed on Render and accessible
- [ ] Firebase authentication is configured
- [ ] CORS is enabled in backend for extension requests
- [ ] API endpoint `/api/external/receive-recording` works
- [ ] File upload size limits are configured (for large videos)

## Known Issues & Solutions

### Issue: "Failed to fetch" error on login
**Cause**: Backend is sleeping (Render free tier)
**Solution**: Visit backend URL first to wake it up:
```
https://meetingmuse-backend.onrender.com/api/health
```

### Issue: "CORS error" in console
**Cause**: Backend doesn't allow extension requests
**Solution**: Add to backend CORS configuration:
```javascript
app.use(cors({
  origin: ['chrome-extension://*', 'https://meetingmuse-frontend.onrender.com'],
  credentials: true
}));
```

### Issue: Upload takes too long or times out
**Cause**: Large video files take time to upload
**Solution**: 
- Recordings are saved locally as backup
- Upload happens in background
- User can close browser and upload continues
- Consider implementing chunked upload for files >100MB

### Issue: "Token expired" error
**Cause**: Firebase token has expired
**Solution**: User needs to logout and login again

## For Development

The extension still works with localhost for testing:
- `http://localhost:8080` - Frontend
- `http://localhost:5000` - Backend

Both production and localhost are supported simultaneously!

## Distribution Options

### Option 1: Manual Distribution
Share the `LexEye` folder with users:
```bash
# Zip the folder
7z a LexEye-Extension.zip LexEye\*
```
Users load it as unpacked extension.

### Option 2: Private Distribution
Host the folder on Google Drive or Dropbox:
- Share read-only link
- Users download and load unpacked

### Option 3: Chrome Web Store (Future)
Publish officially:
- Create developer account ($5 one-time)
- Package extension as .crx
- Submit for review (takes 1-3 days)
- Users can install with one click

## Support

If issues arise:
1. Check browser console: `F12` → Console tab
2. Check extension logs: `chrome://extensions/` → Details → Inspect views: service worker
3. Verify backend is running: Visit backend URL in browser
4. Check Firebase console for authentication errors

---

**Ready to use!** 🚀

The extension is now configured for production deployment and will automatically upload recordings to your MeetingMuse account.
