# Video Generation with Veo 3 - Setup Guide

## ✅ Current Status

Veo 3 integration supports **image-to-video** (including HTTP image URLs) and **text-to-video**, with correct duration handling and Supabase storage.

## 🔧 What Was Fixed (Latest)

### 1. **Duration: Veo-Allowed Values Only**
- **Veo supports only 4, 6, or 8 seconds** for initial generation. Image-to-video supports **8 seconds only**.
- The API now maps your chosen duration to an allowed value: e.g. 5s→6s, 10s/15s/30s→8s. When you provide an image, duration is always 8s.

### 2. **Image-to-Video with Uploaded Images**
- Previously only `gs://` URLs were sent to Veo; **HTTP(S) URLs (e.g. Supabase uploads) were ignored**.
- The API now fetches HTTP(S) images, converts them to base64, and sends `bytesBase64Encoded` + `mimeType` to Veo so your uploaded reference image is used.

### 3. **Project ID and Supabase**
- Project ID is read from `GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON.project_id` (no hardcoded project).
- Supabase is accessed via `createServiceClient()`; no empty env fallbacks.

### 4. **Storage Bucket**
- The `generated-videos` bucket is created in `database-setup.sql`. Run that SQL if you haven’t so the bucket exists.

### 5. **Earlier Fixes**
- Correct model endpoint: `veo-3.1-generate-001`, `:predictLongRunning`
- Required `generateAudio: true`, `compressionQuality: 'optimized'`
- Frontend polling up to 10 minutes with clear status messages

## 📋 Requirements

### Google Cloud Setup
1. **Vertex AI API** - ✅ Enabled
2. **Service Account** - ✅ Configured in `.env.local`
3. **IAM Permissions** - ✅ Working (service account has access)

### Environment Variables
```bash
GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

## 🎬 How It Works

1. **User uploads image** (optional) → Stored in Supabase Storage → API fetches it and sends as base64 to Veo when provided.
2. **Submit generation request** → Credits deducted; duration mapped to 4/6/8s (8s if image); creates Long-Running Operation (LRO).
3. **Frontend polls status** → GET with `jobId` + `operationName` every 5 seconds for up to 10 minutes.
4. **Video ready** → API downloads from Veo, uploads to Supabase `generated-videos` bucket, returns public URL.

## 🧪 Testing

Run the test script to verify your setup:
```bash
node scripts/test-veo-api.js
```

Expected output:
```
✅ Service account JSON parsed successfully
✅ Access token obtained successfully
✅ Video generation request successful!
✨ Your Veo 3 API is working correctly!
```

## 📊 Available Models

- `veo-3.1-generate-001` - Latest, best quality (recommended)
- `veo-3.1-fast-generate-001` - Faster generation
- `veo-3.0-generate-001` - Previous generation
- `veo-3.0-fast-generate-001` - Previous generation, faster

## ⚙️ Video Settings

### Duration (Veo API)
- **Allowed values:** 4, 6, or 8 seconds only. Image-to-video uses **8 seconds only**.
- The UI offers 4s, 6s, 8s to match the API. Credits: 40, 60, 80 respectively.

### Aspect Ratios
- 16:9 (landscape)
- 9:16 (portrait)

### Resolution
- Veo outputs 720p or 1080p (model-dependent).

## 🐛 Troubleshooting

### "Video generation timed out"
- **Cause**: Video takes longer than 10 minutes (rare)
- **Solution**: Video may still be processing. Check database `video_generation_jobs` table

### "Model not found" / "Project not configured"
- **Cause**: Wrong or missing `project_id` in `GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON`, or model not available in region
- **Solution**: Ensure the JSON has `project_id` and use `veo-3.1-generate-001` or `veo-3.0-generate-001` in `us-central1`

### "Permission denied"
- **Cause**: Service account lacks IAM permissions
- **Solution**: Add "Vertex AI User" role to service account

### Image not used (text-to-video only)
- **Cause**: Image URL failed to fetch (CORS, auth, or timeout)
- **Solution**: API falls back to text-to-video. Use a publicly reachable image URL or `gs://` from your GCS bucket.

## 📝 API Response Flow

```
POST /api/video/generate
  ↓
Returns: { operationName, jobId, requiresPolling: true }
  ↓
Frontend polls: GET /api/video/generate?operationName=...
  ↓
Returns: { status: 'processing' | 'completed' | 'error', videoUrl? }
  ↓
When complete: { status: 'completed', videoUrl: 'https://...' }
```

## 💡 Tips

1. **Be specific in prompts** - Better prompts = better videos
2. **Use reference images** - Helps guide the style and content
3. **Start with shorter durations** - 4-6 seconds generate faster
4. **Monitor credits** - Each generation costs credits based on duration

## 🔗 Resources

- [Veo API Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [Vertex AI Console](https://console.cloud.google.com/vertex-ai)
- [Service Account IAM](https://console.cloud.google.com/iam-admin/serviceaccounts)
