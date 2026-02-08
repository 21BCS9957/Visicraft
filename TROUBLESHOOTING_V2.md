# Troubleshooting Guide - Workflow Editor V2

## ✅ FIXED: Connection Data Flow Issues

**Status**: RESOLVED in latest update

The connection data flow has been completely fixed! Here's what was wrong and how it was solved:

### What Was Broken
1. Direct data mutations (`data.status = 'processing'`) weren't triggering React re-renders
2. Connection updates weren't properly propagating to target nodes
3. Uploading images after making connections didn't update connected nodes

### What Was Fixed
1. **Proper State Management**: All nodes now use `useReactFlow()` hook with `setNodes()` for immutable updates
2. **Connection Logic**: `onConnect` now properly maps over nodes and returns new objects
3. **Upload Updates**: Import nodes now update connected Generate nodes when images are uploaded
4. **Better Logging**: Added emoji-prefixed console logs for easy debugging (🔗, ✅, 🎯, 📤, 📥, ❌)

### Files Updated
- `Canvas.tsx` - Fixed connection logic
- `GenerateNode.tsx` - Added proper state management
- `ImportNode.tsx` - Added connected node updates
- `PropertiesPanel.tsx` - Synchronized with node updates

See `CONNECTION_FIX.md` for detailed technical explanation.

---

## Common Errors & Solutions

### 1. "Connect both reference and source images first"

**Cause**: Generate node doesn't have images connected

**Solution**:
1. Add two Import nodes
2. Upload images to both
3. Connect first Import to "Reference Image" handle (top, orange)
4. Connect second Import to "Source Image" handle (middle, yellow)
5. Try running again

**Check**:
- Open browser console (F12)
- Look for "Generate Node Data" log
- Verify both URLs are present

---

### 2. API 400 Error: "Missing required fields"

**Cause**: Request body is missing referenceImageUrl or sourceImageUrls

**Solution**:
1. Check console logs for "API Request"
2. Verify both image URLs are in the request
3. Make sure images are uploaded before connecting
4. Reconnect the nodes if needed

**Debug**:
```javascript
// In console, check:
{
  referenceImageUrl: "https://...",  // Should be present
  sourceImageUrls: ["https://..."],  // Should be array with URL
  prompt: "..."
}
```

---

### 3. API 500 Error: "Gemini API error"

**Cause**: Gemini API key missing or invalid

**Solution**:
1. Check `.env.local` file
2. Verify `GEMINI_API_KEY=your_key_here` is set
3. Get key from: https://aistudio.google.com/apikey
4. Restart dev server: `npm run dev`

**Verify**:
```bash
# In terminal
cat .env.local | grep GEMINI_API_KEY
# Should show: GEMINI_API_KEY=AIza...
```

---

### 4. ReactFlow Warning: "nodeTypes recreated"

**Status**: ✅ Fixed in latest version

**What it was**: nodeTypes object was being recreated on every render

**Fix applied**: Moved nodeTypes outside component

---

### 5. ReactFlow Warning: "Container needs width and height"

**Cause**: Parent container doesn't have dimensions

**Solution**: Already fixed with `overflow-hidden` class

**If still seeing**:
- Refresh the page
- Check if custom CSS is interfering
- Verify parent div has `flex-1` class

---

### 6. Hydration Mismatch Warning

**Cause**: SSR/client rendering differences

**Impact**: Visual only, doesn't affect functionality

**Solution**: Can be ignored, or:
- Clear browser cache
- Restart dev server
- Check for browser extensions interfering

---

### 7. Images Not Uploading to Supabase

**Symptoms**:
- Upload button doesn't work
- "Upload failed" toast
- Console shows Supabase errors

**Solutions**:

**A. Check Supabase Configuration**
```bash
# Verify .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**B. Check Storage Buckets**
1. Go to Supabase Dashboard
2. Navigate to Storage
3. Verify `source-images` bucket exists
4. Check bucket is public

**C. Check RLS Policies**
```sql
-- Run in Supabase SQL Editor
SELECT * FROM storage.policies WHERE bucket_id = 'source-images';
```

---

### 8. "No image returned from API"

**Cause**: Gemini API returned success but no image data

**Solutions**:

**A. Check API Response**
- Open console
- Look for "API Response" log
- Check if `thumbnails` array is empty

**B. Check Gemini API**
- Verify API key is valid
- Check quota/rate limits
- Try again after a moment

**C. Check Image URLs**
- Make sure URLs are accessible
- Test URLs in browser
- Verify Supabase images are public

---

### 9. Rate Limit Exceeded

**Message**: "Rate limit exceeded. Please try again in a moment."

**Cause**: Too many API requests

**Solutions**:
- Wait 60 seconds
- Check Gemini API dashboard for limits
- Free tier: 15 requests/minute
- Consider upgrading for higher limits

---

### 10. Connection Not Working

**Symptoms**:
- Can't drag connections
- Handles don't connect
- Connection disappears

**Solutions**:

**A. Check Handle Types**
- Source handles (right side) → Target handles (left side)
- Can't connect source to source
- Can't connect target to target

**B. Refresh Page**
- Sometimes ReactFlow state gets confused
- Refresh browser
- Nodes will be lost (save workflow first if needed)

**C. Check Console**
- Look for ReactFlow errors
- Check for JavaScript errors

---

## Debug Checklist

Before running Generate node:

- [ ] Gemini API key set in `.env.local`
- [ ] Dev server restarted after adding key
- [ ] Two Import nodes added
- [ ] Images uploaded to both Import nodes
- [ ] Import nodes connected to Generate node
- [ ] Reference image → orange handle (top)
- [ ] Source image → yellow handle (middle)
- [ ] (Optional) Prompt → cyan handle (bottom)
- [ ] Browser console open (F12)
- [ ] No errors in console

---

## Console Logs to Check

### Successful Flow:
```
Generate Node Data: {
  referenceImageUrl: "https://xxx.supabase.co/storage/v1/...",
  sourceImageUrl: "https://xxx.supabase.co/storage/v1/...",
  promptText: "Create a professional YouTube thumbnail"
}

API Request: {
  referenceImageUrl: "https://...",
  sourceImageUrls: ["https://..."],
  prompt: "..."
}

API Response: {
  status: 200,
  result: {
    success: true,
    thumbnails: ["data:image/png;base64,..."],
    generationId: 123
  }
}
```

### Failed Flow (Missing Images):
```
Generate Node Data: {
  referenceImageUrl: undefined,  // ❌ Problem!
  sourceImageUrl: undefined,     // ❌ Problem!
  promptText: undefined
}
```

### Failed Flow (API Error):
```
API Response: {
  status: 500,
  result: {
    error: "Gemini API error: Invalid API key"  // ❌ Fix API key!
  }
}
```

---

## Quick Fixes

### Reset Everything
```bash
# Stop server
Ctrl+C

# Clear Next.js cache
rm -rf .next

# Restart
npm run dev
```

### Check Environment
```bash
# Verify all env vars
cat .env.local

# Should have:
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# GEMINI_API_KEY=...
```

### Test Supabase
```bash
# Run test script
node scripts/test-supabase.js
```

### Test Gemini API
```bash
# In browser console on /workflow page
fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    referenceImageUrl: 'https://example.com/image.jpg',
    sourceImageUrls: ['https://example.com/image2.jpg'],
    prompt: 'test'
  })
}).then(r => r.json()).then(console.log)
```

---

## Still Having Issues?

1. **Check Documentation**:
   - `GEMINI_SETUP.md` - API setup
   - `RUN_NODE_GUIDE.md` - How to run nodes
   - `WORKFLOW_V2_GUIDE.md` - Full guide

2. **Check Console**:
   - Open DevTools (F12)
   - Look for red errors
   - Check Network tab for failed requests

3. **Check Logs**:
   - Terminal where `npm run dev` is running
   - Look for server-side errors

4. **Try Simple Test**:
   - Use `/generate` page instead
   - If that works, issue is in workflow editor
   - If that fails, issue is in API/Gemini setup

---

**Last Updated**: February 2026
**Version**: 2.1
