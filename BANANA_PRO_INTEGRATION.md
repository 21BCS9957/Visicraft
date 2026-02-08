# Nano Banana API Integration

## Overview

This project uses the **Nano Banana Pro** API for AI-powered thumbnail generation. The API is async-based and uses URL-based image inputs.

## API Configuration

### Environment Variables

Only one environment variable is required:

```env
BANANA_API_KEY=your_nano_banana_api_key
```

Get your API key from: https://nanobananaapi.ai/

### API Endpoints

**Generation (Submit Task):**
```
POST https://api.nanobananaapi.ai/api/v1/nanobanana/generate-pro
```

**Check Status:**
```
GET https://api.nanobananaapi.ai/api/v1/nanobanana/task/{taskId}
```

### Authentication

Authentication is done via Bearer token:

```
Authorization: Bearer YOUR_API_KEY
```

## Request Format

```json
{
  "prompt": "Create a professional YouTube thumbnail",
  "imageUrls": [
    "https://example.com/reference.jpg",
    "https://example.com/source1.jpg",
    "https://example.com/source2.jpg"
  ],
  "resolution": "2K",
  "aspectRatio": "16:9"
}
```

## Response Format

**Initial Response (Task Submission):**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "taskId": "task_12345678"
  }
}
```

**Task Status Response:**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "nanobanana_task_123456",
    "response": {
      "originImageUrl": "https://...",
      "resultImageUrl": "https://..."
    },
    "successFlag": 1,
    "errorCode": 0,
    "errorMessage": ""
  }
}
```

## Implementation Details

### File: `lib/banana/api.ts`

The Nano Banana API client handles:
- Submitting generation tasks with image URLs
- Polling for task completion (checks every 2 seconds)
- Error handling and timeout management (max 2 minutes)
- Extracting the generated thumbnail URL

### Key Functions

1. **generateThumbnail()**: Main function that submits and polls
   - Takes reference image URL, source image URLs array, and optional prompt
   - Returns array with generated thumbnail URL
   - Automatically polls until completion

2. **pollTaskStatus()**: Internal polling function
   - Checks task status every 2 seconds
   - Max 60 attempts (2 minutes total)
   - Returns result URL when complete

## Usage Example

```typescript
import { generateThumbnail } from '@/lib/banana/api';

const thumbnails = await generateThumbnail(
  'https://supabase.co/storage/reference.jpg',
  [
    'https://supabase.co/storage/source1.jpg',
    'https://supabase.co/storage/source2.jpg'
  ],
  "Make it vibrant and eye-catching"
);
```

## Features

- **Async Processing**: Submit task and poll for results
- **URL-based**: Works with publicly accessible image URLs (Supabase storage)
- **High Resolution**: Supports 1K, 2K, and 4K output
- **Aspect Ratios**: Multiple ratios including 16:9 for YouTube
- **Automatic Polling**: Handles status checking automatically

## Configuration Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| resolution | 1K, 2K, 4K | 2K | Output image resolution |
| aspectRatio | 1:1, 16:9, etc. | 16:9 | Output aspect ratio |
| prompt | string | "Create a professional YouTube thumbnail" | Text description |
| imageUrls | string[] | - | Reference + source images (max 8) |

## Error Handling

The API client includes comprehensive error handling:
- Network errors
- API response errors
- Task timeout errors (after 2 minutes)
- Invalid API key errors
- Task failure errors

All errors are caught and re-thrown with descriptive messages.

## Getting Your API Key

1. Sign up at [nanobananaapi.ai](https://nanobananaapi.ai)
2. Navigate to API Key Management
3. Copy your API key
4. Add to `.env.local`:
   ```
   BANANA_API_KEY=your_key_here
   ```

## Testing the Integration

To test if your Nano Banana API key is working:

1. Ensure `.env.local` has your API key
2. Run the development server: `npm run dev`
3. Navigate to `/generate`
4. Upload a reference image and source images
5. Click "Generate Thumbnails"
6. Wait for processing (usually 10-30 seconds)
7. Check the browser console and server logs for any errors

## Troubleshooting

### "BANANA_API_KEY is not configured"
- Check that `.env.local` exists and has the API key
- Restart the development server after adding the key

### "Banana API error: Unauthorized"
- Verify your API key is correct
- Check if your Nano Banana account is active
- Ensure you have credits remaining

### "Task timeout" errors
- Generation took longer than 2 minutes
- Check Nano Banana service status
- Try with fewer or smaller images

### "Failed to submit generation task"
- Check that image URLs are publicly accessible
- Verify Supabase storage buckets are public
- Ensure images are in supported formats (JPG, PNG, WebP)

## Rate Limits & Credits

- Check your Nano Banana plan for rate limits
- Monitor your credit usage in the dashboard
- Consider implementing request queuing for high-volume apps

## Performance Tips

1. **Image URLs**: Ensure Supabase URLs are publicly accessible
2. **Image Size**: Smaller images process faster
3. **Polling**: Current implementation polls every 2 seconds
4. **Timeout**: Max wait time is 2 minutes (60 attempts × 2 seconds)

## API Documentation

Full documentation: https://docs.nanobananaapi.ai/
