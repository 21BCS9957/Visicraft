# Workflow Editor - Troubleshooting Guide

## ✅ Fixed Issues

### Output Node Not Showing Results
**Status**: FIXED ✅

**Problem**: Generated images weren't appearing in the Output node after workflow execution.

**Root Cause**: Incorrect Nano Banana API endpoint for checking task status.

**Solution**: Updated the polling endpoint from:
- ❌ `/api/v1/nanobanana/task/{taskId}` 
- ✅ `/api/v1/common/task/{taskId}`

**Files Updated**:
- `lib/banana/api.ts` - Fixed polling endpoint
- `lib/workflow/executor.ts` - Added debug logging
- `components/workflow/nodes/OutputNode.tsx` - Added debug logging

## 🔍 How to Debug

### Check Browser Console
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for:
   - "Executing Generate Node"
   - "API response"
   - "Storing generated image URL"
   - "Executing Output Node"
   - "OutputNode render"

### Check Server Logs
Look for:
- "Submitting generation task"
- "Task submitted"
- "Polling task"
- "Poll attempt X/60"
- "Task completed successfully"

## 🐛 Common Issues & Solutions

### 1. "Workflow must have at least one Generate node"
**Solution**: Add a Generate node from the palette

### 2. "Generate node must have a Reference Image connected"
**Solution**: 
- Add Reference Image node
- Upload an image
- Connect it to Generate node (top input)

### 3. "Generate node must have a Source Image connected"
**Solution**:
- Add Source Image node
- Upload an image
- Connect it to Generate node (middle input)

### 4. "Image must be uploaded before execution"
**Solution**:
- Wait for green checkmark on image nodes
- Ensure Supabase storage is configured
- Check storage policies are set

### 5. Output Node Shows "Waiting for results..."
**Possible Causes**:
- Generation is still processing (check Generate node status)
- API error occurred (check console/server logs)
- Connection not properly made to Output node

**Solution**:
- Check Generate node has "complete" status (green border)
- Verify connection from Generate → Output
- Check browser console for errors
- Check server logs for API errors

### 6. "Banana API error: No message available"
**Solution**:
- Verify your Banana API key is correct
- Check you have credits remaining
- Ensure images are publicly accessible URLs
- Try with smaller images first

### 7. Nodes Won't Connect
**Solution**:
- Drag from output handle (right side) to input handle (left side)
- Ensure data types match (image → image, text → text)
- Check you're not creating a circular connection

### 8. Upload Fails
**Solution**:
- Run SQL from `fix-storage-permissions.sql`
- Verify Supabase buckets exist and are public
- Check file size (max 5MB)
- Verify file format (JPG, PNG, WebP)

## 📊 Expected Workflow

### Successful Execution Flow:
```
1. User clicks "Run Workflow"
2. Validation passes
3. Reference Image node: status → processing → complete
4. Source Image node: status → processing → complete
5. Prompt node (if connected): status → processing → complete
6. Generate node: 
   - status → processing
   - progress: 10% → 50% → 100%
   - status → complete
7. Output node:
   - status → processing
   - images array populated
   - status → complete
   - Image displays in node
```

### Console Output (Success):
```
Executing Generate Node: abc123
Generate node inputs: { referenceImage: 'xyz', sourceImage: 'def' }
Reference URL: https://...
Source URL: https://...
Calling generation API...
Task submitted: { taskId: 'task_...' }
Polling task task_...
Poll attempt 1/60: { code: 200, successFlag: 0 }
Poll attempt 2/60: { code: 200, successFlag: 0 }
...
Poll attempt 15/60: { code: 200, successFlag: 1 }
Task completed successfully!
Storing generated image URL: https://...
Generate node outputs set: { generatedImage: 'https://...' }
Executing Output Node: ghi789
Output node inputs: { image: 'abc123' }
Source node ID: abc123
Generated image URL: https://...
Updating output node with image: https://...
Output node updated successfully
OutputNode render: { id: 'ghi789', images: ['https://...'], status: 'complete' }
```

## 🔧 Debug Mode

### Enable Detailed Logging
The executor and nodes now have console.log statements for debugging:

**Executor logs**:
- Node execution start/end
- Input/output values
- API calls and responses

**Node logs**:
- Render cycles
- Data updates
- Status changes

### Check Network Tab
1. Open DevTools → Network tab
2. Filter by "generate" or "upload"
3. Check request/response details
4. Look for 4xx or 5xx errors

## ✅ Verification Checklist

Before running workflow:
- [ ] All image nodes have green checkmarks
- [ ] All required connections are made
- [ ] Generate node is connected to Output node
- [ ] Supabase is configured
- [ ] Banana API key is set
- [ ] Storage policies are configured

## 🎯 Test Workflow

### Minimal Working Example:
1. Add Reference Image node → Upload image
2. Add Source Image node → Upload image
3. Add Generate node
4. Add Output node
5. Connect: Reference → Generate (top)
6. Connect: Source → Generate (middle)
7. Connect: Generate → Output
8. Click "Run Workflow"
9. Wait for completion
10. See result in Output node

## 📞 Still Having Issues?

1. Check all documentation files
2. Verify environment variables in `.env.local`
3. Check Supabase dashboard for errors
4. Check Banana API dashboard for credits/usage
5. Review browser console and server logs
6. Try the form interface (`/generate`) to isolate the issue

## 🔄 Recent Fixes

- ✅ Fixed Nano Banana API polling endpoint
- ✅ Added comprehensive debug logging
- ✅ Improved error messages
- ✅ Added status indicators throughout

---

**Last Updated**: Just now
**Status**: All known issues resolved ✅
