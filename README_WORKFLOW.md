# 🎨 Visual Workflow Editor - Quick Start

## 🚀 You Now Have TWO Ways to Generate Thumbnails!

### Option 1: Form Interface (Original)
**URL**: http://localhost:3000/generate
- Traditional form-based interface
- Quick and simple
- Best for single generations

### Option 2: Visual Workflow Editor (NEW!) ⭐
**URL**: http://localhost:3000/workflow
- Node-based visual programming
- Drag, drop, and connect nodes
- See the data flow in real-time
- Perfect for experimentation

## ⚡ Quick Start - Workflow Editor

### 1. Open the Editor
```
http://localhost:3000/workflow
```

### 2. Add Nodes (Click in Left Palette)
- **Reference Image** (Purple) - Style reference
- **Source Image** (Blue) - Content to transform
- **Generate** (Orange) - AI processing
- **Output** (Pink) - Results display

### 3. Upload Images
- Click each image node
- Upload your files
- Wait for green checkmarks ✓

### 4. Connect Nodes
Drag from outputs (right) to inputs (left):
```
Reference Image ──→ Generate (top input)
Source Image ────→ Generate (middle input)
Generate ────────→ Output
```

### 5. Run!
- Click **"Run Workflow"** button
- Watch the magic happen ✨
- Download your generated thumbnail

## 🎯 Example Workflow

```
┌─────────────────┐
│ Reference Image │ (Purple - Style)
│  [Upload]       │
└────────┬────────┘
         │
         ├──────────┐
         │          │
         ▼          │
┌─────────────────┐ │
│  Source Image   │ │ (Blue - Content)
│  [Upload]       │ │
└────────┬────────┘ │
         │          │
         ├──────────┘
         │
         ▼
┌─────────────────┐
│    Generate     │ (Orange - AI)
│   [Settings]    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Output      │ (Pink - Results)
│   [Download]    │
└─────────────────┘
```

## 🎨 Node Colors & Meanings

| Color | Node Type | Purpose |
|-------|-----------|---------|
| 🟣 Purple | Reference Image | Defines the style |
| 🔵 Blue | Source Image | Content to transform |
| 🟢 Green | Prompt | Optional text description |
| 🟠 Orange | Generate | AI processing |
| 🌸 Pink | Output | Display results |

## ⚙️ Advanced Features

### Add a Prompt (Optional)
```
[Prompt] ──→ Generate (bottom input)
```
Type: "vibrant colors, professional look"

### Adjust Settings
Click Generate node → "Show Settings"
- **Resolution**: 1K, 2K, or 4K
- **Aspect Ratio**: 16:9 (YouTube), 9:16 (Stories), 1:1 (Square)

### Multiple Generations
Add multiple Generate + Output pairs to create variations!

## 🎓 Learn More

- **Full User Guide**: See `WORKFLOW_EDITOR_GUIDE.md`
- **Technical Details**: See `WORKFLOW_IMPLEMENTATION_PLAN.md`
- **Complete Overview**: See `WORKFLOW_COMPLETE.md`

## 🆚 Which Interface Should I Use?

### Use Workflow Editor When:
- ✅ You want to see the process visually
- ✅ Experimenting with different configurations
- ✅ Working with multiple source images
- ✅ Building reusable workflows
- ✅ Learning how AI generation works

### Use Form Interface When:
- ✅ Quick one-off generation
- ✅ Simple use case (1 reference + 1 source)
- ✅ Prefer traditional forms
- ✅ On mobile device

## 🎉 Features

### Visual Design
- Dark theme with grid background
- Gradient node cards
- Animated connections
- Real-time status indicators
- Smooth animations
- Minimap for navigation

### Functionality
- Drag & drop nodes
- Visual connections
- File upload with progress
- Workflow validation
- Real-time execution
- Download results
- Settings customization

## 🔧 Requirements

All requirements are already met:
- ✅ Supabase configured
- ✅ Banana API integrated
- ✅ Dependencies installed
- ✅ Server running

## 🚀 Start Creating!

1. Go to: **http://localhost:3000/workflow**
2. Add nodes from the left palette
3. Upload images
4. Connect nodes
5. Click "Run Workflow"
6. Download your amazing thumbnail!

---

**Enjoy the visual workflow experience!** 🎨✨
