# 🔌 Connection Guide - Which Dot Connects Where?

## Visual Guide

```
┌─────────────┐                    ┌──────────────────┐
│   IMPORT    │                    │  GEMINI GENERATE │
│   NODE      │                    │      NODE        │
│             │                    │                  │
│  [Image]    │ ─────────────────> │ 🟠 Reference     │ (Top - Orange)
│             │  Blue → Orange     │                  │
└─────────────┘                    │ 🟡 Source        │ (Middle - Yellow)
                                   │                  │
┌─────────────┐                    │ 🔵 Prompt        │ (Bottom - Cyan)
│   IMPORT    │                    │                  │
│   NODE      │                    │                  │
│             │ ─────────────────> │                  │
│  [Image]    │  Blue → Yellow     │    [Generated]   │ ───> Output
│             │                    │                  │
└─────────────┘                    └──────────────────┘
```

## 🎯 Simple Instructions

### Step 1: Add Nodes
1. Click **Import** icon (📷) in left sidebar → Drag to canvas
2. Add another **Import** node
3. Add **Generate** node (⚡)

### Step 2: Upload Images
1. Click first Import → Upload your **reference image** (style inspiration)
2. Click second Import → Upload your **source image** (content to transform)

### Step 3: Connect the Dots

#### Connection 1: Reference Image
```
Import Node (Blue dot on right) 
    ↓
    Connect to
    ↓
Generate Node (🟠 Orange dot - TOP)
```
**This is your style reference!**

#### Connection 2: Source Image
```
Import Node (Blue dot on right)
    ↓
    Connect to
    ↓
Generate Node (🟡 Yellow dot - MIDDLE)
```
**This is your content image!**

### Step 4: Run
Click **"Run Generation"** button in the Generate node

## 🎨 Color Code

| Color | Position | Purpose | Required? |
|-------|----------|---------|-----------|
| 🟠 **Orange** | Top | Reference Image (style) | ✅ Yes |
| 🟡 **Yellow** | Middle | Source Image (content) | ✅ Yes |
| 🔵 **Cyan** | Bottom | Text Prompt | ❌ Optional |
| 🟢 **Green** | Right | Generated Output | Auto |

## 📝 What Each Input Does

### 🟠 Reference Image (Top - Orange)
- **Purpose**: Provides the style/look you want
- **Example**: A professional YouTube thumbnail you like
- **Effect**: AI will match this style

### 🟡 Source Image (Middle - Yellow)
- **Purpose**: The content you want to transform
- **Example**: Your photo, product, or scene
- **Effect**: AI will transform this using reference style

### 🔵 Prompt (Bottom - Cyan) - Optional
- **Purpose**: Additional text instructions
- **Example**: "Make it more vibrant" or "Add dramatic lighting"
- **Effect**: Guides the AI generation

## 🎬 Quick Workflow

```
1. Upload to Import #1 (reference style)
2. Upload to Import #2 (your content)
3. Connect Import #1 → Generate (🟠 top orange dot)
4. Connect Import #2 → Generate (🟡 middle yellow dot)
5. Click "Run Generation"
6. Wait for result!
```

## 🔍 How to Tell Which Dot is Which

### On Generate Node (Left Side):
- **TOP dot** = 🟠 Orange = "Reference Image →"
- **MIDDLE dot** = 🟡 Yellow = "Source Image →"
- **BOTTOM dot** = 🔵 Cyan = "Prompt (optional) →"

### On Import Node (Right Side):
- **Single dot** = 🔵 Blue = "← Image"

### On Generate Node (Right Side):
- **Single dot** = 🟢 Green = "← Generated"

## 💡 Pro Tips

1. **Hover over dots** - Labels appear showing what each connection is for
2. **Color matching** - Each dot has a unique color to help you remember
3. **Position matters** - Top = Reference, Middle = Source, Bottom = Prompt
4. **Labels visible** - Text labels now show next to each dot!

## ❓ Common Questions

**Q: Which image goes to which dot?**
A: 
- Style reference → 🟠 Top (orange)
- Your content → 🟡 Middle (yellow)

**Q: Do I need to connect all three dots?**
A: No! Only the top two (🟠 orange and 🟡 yellow) are required. The bottom 🔵 cyan is optional.

**Q: Can I connect one Import to multiple dots?**
A: Yes! You can connect the same Import to both reference and source if you want.

**Q: What if I connect them backwards?**
A: The AI will use the wrong image as reference. Just disconnect and reconnect correctly!

## 🎯 Example Use Cases

### Use Case 1: YouTube Thumbnail
```
Import #1 (Reference) → Professional thumbnail you like
Import #2 (Source) → Your face/content
Result → Your content in that thumbnail style
```

### Use Case 2: Product Photo
```
Import #1 (Reference) → High-end product photo style
Import #2 (Source) → Your product photo
Result → Your product in professional style
```

### Use Case 3: Artistic Transform
```
Import #1 (Reference) → Painting or art style
Import #2 (Source) → Your photo
Result → Your photo in that art style
```

## 🚨 Troubleshooting

**"Connect both reference and source images first"**
- You forgot to connect one of the dots
- Make sure BOTH 🟠 orange (top) AND 🟡 yellow (middle) are connected

**"Can't see the labels"**
- Zoom in on the canvas
- Labels appear next to each colored dot

**"Connected but not working"**
- Check console (F12) for "🔗 Connection made" message
- Verify images are uploaded first
- Make sure you connected to the correct colored dots

## 📸 Visual Reference

When you look at the Generate node, you'll see:

```
        Reference Image → 🟠  ┐
                              │
        Source Image →    🟡  ├─ [GENERATE NODE]
                              │
        Prompt (optional) → 🔵 ┘
```

The labels are now visible on the canvas, so you can't miss them!
