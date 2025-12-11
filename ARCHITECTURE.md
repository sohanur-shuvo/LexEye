# LexEye Extension Architecture - Production Setup

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Chrome Browser                               │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     LexEye Extension                          │   │
│  │                                                                │   │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐   │   │
│  │  │  popup-new.js │  │ background.js│  │   content.js     │   │   │
│  │  │               │  │              │  │                  │   │   │
│  │  │ - Login UI    │  │ - Recorder   │  │ - Meeting detect │   │   │
│  │  │ - Auth flow   │  │   Manager    │  │ - Screen capture │   │   │
│  │  │ - Settings    │  │ - Messages   │  │ - Audio mixing   │   │   │
│  │  │               │  │              │  │ - Upload logic   │   │   │
│  │  └───────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │   │
│  │          │                 │                   │             │   │
│  └──────────┼─────────────────┼───────────────────┼─────────────┘   │
│             │                 │                   │                 │
│  ┌──────────▼─────────────────▼───────────────────▼─────────────┐   │
│  │              Meeting Platforms (Content Scripts)              │   │
│  │                                                                │   │
│  │  teams.microsoft.com  │  meet.google.com  │  zoom.us          │   │
│  └────────────────────────────────────────────────────────────────   │
│                                                                       │
└───────────────────────────┬───────────────────────────────────────────┘
                            │
                            │ HTTPS (Secure)
                            │
        ┌───────────────────┴────────────────────┐
        │                                        │
        │                                        │
┌───────▼────────────────────────┐   ┌───────────▼────────────────────┐
│  MeetingMuse Frontend          │   │  MeetingMuse Backend           │
│  (Render Deployment)           │   │  (Render Deployment)           │
│                                │   │                                │
│  🌐 meetingmuse-frontend       │   │  🌐 meetingmuse-backend        │
│     .onrender.com              │   │     .onrender.com              │
│                                │   │                                │
│  ┌──────────────────────────┐ │   │  ┌──────────────────────────┐ │
│  │  Login Page              │ │   │  │  /api/auth/login         │ │
│  │  Dashboard               │ │   │  │  /api/auth/me            │ │
│  │  Meeting List            │ │   │  │  /api/external/          │ │
│  │  Transcripts             │ │   │  │    receive-recording     │ │
│  │  Summaries               │ │   │  │                          │ │
│  └──────────────────────────┘ │   │  └──────────────────────────┘ │
│                                │   │                                │
│  Extension can:                │   │  Extension sends:              │
│  • Open for Google login       │   │  • Video file (base64)         │
│  • Sync auth tokens            │   │  • Metadata (platform, date)   │
│                                │   │  • Firebase auth token         │
└────────────────┬───────────────┘   └───────────┬────────────────────┘
                 │                               │
                 │                               │
                 └───────────┬───────────────────┘
                             │
                    ┌────────▼─────────┐
                    │   Firebase       │
                    │   Services       │
                    │                  │
                    │  • Authentication│
                    │  • Cloud Storage │
                    │  • Firestore DB  │
                    └──────────────────┘
```

## Data Flow

### 1. Authentication Flow
```
User → Extension Popup → Backend API → Firebase Auth
                     ↓
              Store token in
           Chrome Storage (local)
                     ↓
              Token sent with
            all API requests
```

### 2. Recording Flow
```
1. User joins meeting (Teams/Meet/Zoom)
   │
   ├─→ Extension detects meeting
   │
   ├─→ User clicks "Start Recording"
   │
   ├─→ Browser asks: Share screen? Microphone?
   │
   ├─→ Extension captures:
   │   • Screen video (1920x1080, 30fps)
   │   • Tab audio (meeting participants)
   │   • Microphone audio (user's voice)
   │
   ├─→ Audio mixed using Web Audio API
   │
   ├─→ MediaRecorder encodes to WebM
   │
   └─→ User clicks "Stop Recording"
       │
       ├─→ Save locally (Downloads folder) ✅
       │
       └─→ Upload to backend
           │
           ├─→ POST /api/external/receive-recording
           │   Headers: Authorization: Bearer <token>
           │   Body: { video: base64, fileName, title, metadata }
           │
           ├─→ Backend validates token
           │
           ├─→ Backend saves to Firebase Storage
           │
           ├─→ Backend creates meeting record
           │
           ├─→ Backend queues for AI processing
           │
           └─→ Success notification ✅
```

### 3. Web Token Sync Flow
```
User logged in to web app (meetingmuse-frontend.onrender.com)
   │
   └─→ Web app stores token in localStorage
           │
           └─→ Extension checks open tabs for MeetingMuse
                   │
                   └─→ Injects script to read localStorage
                           │
                           └─→ Extracts: token, email, uid
                                   │
                                   └─→ Saves to Chrome Storage
                                           │
                                           └─→ Auto-login in extension ✅
```

## Configuration Summary

| Component | URL | Purpose |
|-----------|-----|---------|
| Frontend | https://meetingmuse-frontend.onrender.com | Web dashboard, login page |
| Backend API | https://meetingmuse-backend.onrender.com | Auth, uploads, processing |
| Auth endpoint | /api/auth/login | Email/password login |
| Token verify | /api/auth/me | Validate tokens |
| Upload endpoint | /api/external/receive-recording | Receive recordings |
| Firebase | meetingmuse-541a0.firebaseapp.com | Auth, storage, database |

## Security Features

- ✅ HTTPS only (TLS encryption)
- ✅ Firebase token authentication
- ✅ Bearer token in headers
- ✅ Tokens stored securely in Chrome Storage
- ✅ CORS validation on backend
- ✅ User can only access their own data
- ✅ Local backup before upload

## Updated Files

1. **manifest.json**
   - Added Render URLs to host_permissions

2. **content.js**
   - Changed default API URL to production

3. **popup-new.js**
   - Updated all API endpoints
   - Added production frontend URL
   - Support for both localhost and production

## Backward Compatibility

Extension works with:
- ✅ Production (Render deployment)
- ✅ Localhost development (port 8080, 5000)
- ✅ Can switch between environments automatically
