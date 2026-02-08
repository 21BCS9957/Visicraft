# Run Node Feature Guide

## ✨ New Feature: Individual Node Execution

You can now run the Generate node individually without using the bottom "Run Selected" button!

## 🎯 Two Ways to Run

### 1. Run Button in Generate Node

Each Generate node now has its own **"Run Generation"** button at the bottom of the node card.

**How to use:**
1. Connect images and prompt to the Generate node
2. Click the **"Run Generation"** button directly on the node
3. Watch the generation happen in real-time
4. Result appears in the node preview area

**Features:**
- ✅ Instant feedback with loading spinner
- ✅ Status updates (Generating... → Complete/Error)
- ✅ Toast notifications for success/errors
- ✅ Disabled state while running

### 2. Run Button in Properties Panel

When you select a Generate node, the Properties Panel shows a **"Run This Node"** button.

**How to use:**
1. Click on a Generate node to select it
2. Properties Panel opens on the right
3. Click **"Run This Node"** button at the bottom
4. Generation starts immediately

**Features:**
- ✅ Same functionality as node button
- ✅ Shows current status
- ✅ Model/settings display
- ✅ Convenient for focused work

## 🔌 How It Works

### Automatic Data Flow

When you connect nodes, data flows automatically:

```
Import Node → Generate Node
  ↓              ↓
  URL    →  referenceImageUrl

Import Node → Generate Node
  ↓              ↓
  URL    →  sourceImageUrl

Prompt Node → Generate Node
  ↓              ↓
  Text   →  promptText
```

### Generation Process

1. **Validation**: Checks if images are connected
2. **API Call**: Sends request to Gemini API
3. **Status Update**: Shows "Generating..." with spinner
4. **Result**: Displays generated image in node
5. **Output**: Automatically flows to connected Output node

## 🎨 Visual Feedback

### Node States

**Idle** (Default)
- Border: Red (#ef4444) with 30% opacity
- Button: "Run Generation"
- Preview: Empty placeholder

**Processing**
- Spinning Zap icon overlay
- Button: "Generating..." (disabled)
- Status badge: Orange "Generating..."

**Complete**
- Generated image displayed
- Button: "Run Generation" (enabled)
- Status badge: Green "✓ Complete"

**Error**
- Previous image (if any) displayed
- Button: "Run Generation" (enabled)
- Status badge: Red "✗ Error"

## 📋 Requirements

Before running a Generate node, make sure:

1. ✅ **Reference Image** connected (orange handle)
2. ✅ **Source Image** connected (yellow handle)
3. ✅ **Prompt** connected (optional, cyan handle)
4. ✅ **Gemini API Key** set in `.env.local`
5. ✅ **Images uploaded** to Supabase

## 🚀 Quick Workflow

### Minimal Setup (2 Images)

```
[Import Node] ──→ [Generate Node] ──→ [Output Node]
     ↓                   ↓
  Upload            Run Button
```

1. Add Import node, upload reference image
2. Add another Import node, upload source image
3. Add Generate node
4. Connect both Import nodes to Generate node
5. Click "Run Generation" on Generate node
6. Add Output node and connect to see result

### Full Setup (With Prompt)

```
[Import Node] ──→ [Generate Node] ──→ [Output Node]
[Import Node] ──→       ↑
[Prompt Node] ──────────┘
```

1. Add 2 Import nodes (reference + source)
2. Add Prompt node with custom text
3. Add Generate node
4. Connect all three to Generate node
5. Click "Run Generation"
6. Connect to Output node

## 💡 Tips

### Best Practices

- **Upload First**: Always upload images before connecting
- **Check Connections**: Verify handles are properly connected
- **One at a Time**: Run one Generate node at a time
- **Watch Status**: Monitor the status badge for feedback
- **Use Properties**: Select node to see detailed status

### Troubleshooting

**"Connect images to this node first"**
- Solution: Make sure Import nodes are connected to the correct handles

**"Generation failed"**
- Check: Gemini API key is set correctly
- Check: Images are uploaded to Supabase
- Check: Image URLs are accessible

**"No image returned"**
- Check: API response in browser console
- Check: Gemini API quota/credits
- Try: Running again after a moment

## 🎯 Comparison: Node Run vs. Bottom Panel Run

| Feature | Node Run Button | Bottom Panel Run |
|---------|----------------|------------------|
| **Scope** | Single node | All connected nodes |
| **Location** | Inside node card | Bottom of screen |
| **Use Case** | Quick test | Full workflow |
| **Feedback** | In-node status | Global status |
| **Speed** | Instant | Sequential |

## 🔄 Data Flow Example

```javascript
// When you click "Run Generation"

1. Validate inputs
   ✓ referenceImageUrl exists?
   ✓ sourceImageUrl exists?

2. Call API
   POST /api/generate
   {
     referenceImageUrl: "https://...",
     sourceImageUrls: ["https://..."],
     prompt: "Create a professional YouTube thumbnail"
   }

3. Update status
   data.status = 'processing'

4. Receive result
   {
     thumbnails: ["https://generated-image.jpg"]
   }

5. Update node
   data.generatedImage = result.thumbnails[0]
   data.status = 'complete'

6. Flow to Output
   Output node automatically receives the image
```

## 📱 UI Elements

### Generate Node Button
```
┌─────────────────────────────────┐
│  🔥 Gemini Generate        ⋮   │
├─────────────────────────────────┤
│                                 │
│     [Generated Image]           │
│                                 │
├─────────────────────────────────┤
│  ▶ Run Generation               │ ← Click here!
└─────────────────────────────────┘
```

### Properties Panel Button
```
┌─────────────────────────────────┐
│  Properties                  ✕  │
├─────────────────────────────────┤
│  🍌 Gemini Pro                  │
│                                 │
│  Model: Gemini 3 Pro Image      │
│  Aspect Ratio: 16:9             │
│  Resolution: 2K                 │
│                                 │
│  Status: ✓ Complete             │
│                                 │
│  ┌───────────────────────────┐  │
│  │ ▶ Run This Node           │  │ ← Or here!
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## 🎉 Benefits

1. **Faster Testing**: No need to run entire workflow
2. **Iterative Design**: Test different prompts quickly
3. **Debugging**: Isolate issues to specific nodes
4. **Flexibility**: Run nodes in any order
5. **Convenience**: Two access points for same action

---

**Status**: ✅ Implemented
**Version**: 2.1
**Feature**: Individual Node Execution
**Date**: February 2026

Happy generating! 🚀
