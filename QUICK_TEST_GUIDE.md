# Quick Test Guide - Workflow Editor

## 🚀 How to Test the Fixes

### Step 1: Open the Workflow Editor
Navigate to: `http://localhost:3000/workflow`

### Step 2: Add Nodes
1. Click the **Import** icon in the left sidebar (📷)
2. Drag it onto the canvas
3. Add another **Import** node
4. Add a **Generate** node (⚡)

### Step 3: Upload Images
1. Click on first Import node
2. Click "Click to upload"
3. Select a reference image (style inspiration)
4. Click on second Import node
5. Upload a source image (content to transform)

### Step 4: Make Connections
1. Drag from first Import's output handle (right side, blue dot)
2. Connect to Generate node's **top handle** (orange - Reference Image)
3. Drag from second Import's output handle
4. Connect to Generate node's **middle handle** (yellow - Source Image)

### Step 5: Check Console Logs
Open browser console (F12) and look for:
```
🔗 Connection made: { from: 'import', to: 'generate', handle: 'referenceImage' }
✅ Set referenceImageUrl: https://zzbdfzwkvogegqdyblre.supabase.co/...
✅ Image uploaded: https://...
```

### Step 6: Run Generation
1. Click the **"Run Generation"** button in the Generate node
2. Watch the console for:
```
🎯 Generate Node Data: {
  nodeId: 'generate-...',
  referenceImageUrl: 'https://...',
  sourceImageUrl: 'https://...',
  promptText: undefined
}
📤 API Request: { referenceImageUrl: '...', sourceImageUrls: [...] }
```

### Step 7: Verify API Call
If you see:
- ✅ Both URLs are present → **Connection working!**
- ❌ URLs are undefined → Check upload and connection steps
- ⚠️ 429 Rate Limit → Gemini API free tier limit (expected)
- ❌ 400 Missing fields → URLs not being passed (shouldn't happen now)

## 🎯 What Should Work Now

### ✅ Upload → Connect → Run
1. Upload images first
2. Make connections
3. Run generation
4. **Result**: API receives both URLs

### ✅ Connect → Upload → Run
1. Make connections first
2. Upload images after
3. Run generation
4. **Result**: Connected nodes automatically receive URLs

### ✅ Properties Panel Run Button
1. Select Generate node
2. Click "Run This Node" in right panel
3. **Result**: Same behavior as node's run button

## 🐛 Debugging Tips

### If URLs are undefined:
1. Check console for "✅ Image uploaded" messages
2. Verify Supabase is configured (check `.env.local`)
3. Check network tab for upload requests

### If connections don't work:
1. Look for "🔗 Connection made" in console
2. Verify you're connecting to the correct handles:
   - Top (orange) = Reference Image
   - Middle (yellow) = Source Image
   - Bottom (cyan) = Prompt (optional)

### If API fails:
1. Check `.env.local` has `GEMINI_API_KEY`
2. Look for "📤 API Request" in console
3. Verify request body has both URLs
4. Check "📥 API Response" for error details

## 📊 Console Log Reference

| Emoji | Meaning | When You See It |
|-------|---------|-----------------|
| 🔗 | Connection made | When you connect two nodes |
| ✅ | Success | Upload complete, data set |
| 🎯 | Data inspection | Before running generation |
| 📤 | API request sent | Calling Gemini API |
| 📥 | API response | Gemini API responded |
| ❌ | Error occurred | Something went wrong |

## 🎨 Optional: Add Prompt Node

1. Add a **Prompt** node (💬)
2. Type your custom prompt
3. Connect it to Generate node's **bottom handle** (cyan)
4. Run generation with custom prompt

## ⚡ Quick Workflow

```
[Import 1] ──(reference)──┐
                           ├──> [Generate] ──> [Output]
[Import 2] ──(source)─────┘
                           
[Prompt] ──(text)─────────┘ (optional)
```

## 🎉 Success Indicators

- ✅ Console shows all URLs
- ✅ Generate node shows "Generating..." status
- ✅ Toast notification appears
- ✅ Generated image appears in node
- ✅ Status badge shows "✓ Complete"

## 🚨 Expected Errors

### Rate Limit (429)
```
❌ Generation error: Rate limit exceeded. Please try again in a moment.
```
**This is normal** - Gemini API free tier has limits. Wait 25 seconds and try again.

### Invalid API Key (401/403)
```
❌ Gemini API error: Invalid API key
```
Check your `GEMINI_API_KEY` in `.env.local`

## 📝 Notes

- Dev server must be running (`npm run dev`)
- Supabase must be configured for uploads
- Gemini API key must be valid
- Free tier has rate limits (expected)
- All console logs use emojis for easy scanning

## 🔄 If Something Goes Wrong

1. Refresh the page
2. Check console for errors
3. Verify `.env.local` configuration
4. Check `TROUBLESHOOTING_V2.md` for detailed help
5. Check `CONNECTION_FIX.md` for technical details
