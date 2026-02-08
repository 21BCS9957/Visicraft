# Workflow Editor V2 - Banana Skating Design

## 🎨 Complete Redesign

The workflow editor has been completely redesigned to match the professional Banana Skating UI/UX.

## ✨ New Features

### Visual Design
- **Dark Theme**: Pure black (#000000) canvas with subtle grays
- **Professional Nodes**: Redesigned with exact Banana Skating styling
- **Gradient Connections**: Beautiful bezier curves with gradient colors
- **Smooth Animations**: Framer Motion animations for all interactions
- **Minimap**: Bottom-right navigation minimap

### Layout
```
┌─────────────────────────────────────────────────┐
│                    Topbar                        │
├──────┬──────────────────────────────┬───────────┤
│      │                              │           │
│ Side │         Canvas               │Properties │
│ bar  │      (ReactFlow)             │  Panel    │
│      │                              │           │
├──────┴──────────────────────────────┴───────────┤
│              Run Controls                        │
└─────────────────────────────────────────────────┘
```

## 🎯 Components

### 1. Topbar (`components/workflow-v2/Topbar.tsx`)
- Project name input
- Share button
- Upgrade button (purple)
- Feedback button
- User avatar

### 2. Sidebar (`components/workflow-v2/Sidebar.tsx`)
- Icon-based tool selector
- Expandable node palette
- Minimal 60px width
- Hover states

### 3. Canvas (`components/workflow-v2/Canvas.tsx`)
- ReactFlow integration
- Custom node types
- Gradient edges
- Minimap
- Black background

### 4. Properties Panel (`components/workflow-v2/PropertiesPanel.tsx`)
- Right sidebar (280px)
- Node-specific settings
- Model selection
- Aspect ratio
- Resolution

### 5. Run Controls (`components/workflow-v2/RunControls.tsx`)
- Bottom panel (80px)
- Run counter with +/- buttons
- White "Run Selected" button
- Status indicator

## 🎨 Node Types

### Import Node
- **Color**: Blue (#3b82f6)
- **Icon**: Image
- **Features**: 
  - Upload zone
  - Image preview
  - Replace button
  - Supabase integration

### Prompt Node
- **Color**: Purple (#8b5cf6)
- **Icon**: MessageSquare
- **Features**:
  - Textarea input
  - Character counter
  - Auto-save to node data

### Generate Node
- **Color**: Red (#ef4444)
- **Icon**: Zap
- **Features**:
  - 3 input handles (reference, source, prompt)
  - Preview area
  - Status indicator
  - Gemini API integration

### Output Node
- **Color**: Purple (#8b5cf6)
- **Icon**: MonitorPlay
- **Features**:
  - Image display
  - Download button
  - Multiple results support

## 🔌 Connections

### Handle Colors
- **Blue** (#3b82f6): Image outputs
- **Orange** (#f97316): Reference images
- **Yellow** (#eab308): Source images
- **Cyan** (#06b6d4): Prompts
- **Purple** (#8b5cf6): Text outputs
- **Green** (#10b981): Generated results

### Edge Styling
- Gradient bezier curves
- Animated flow
- 2px stroke width
- Smooth transitions

## 🚀 Usage

### Adding Nodes
1. Click the Nodes icon (Square) in sidebar
2. Click a node type to add to canvas
3. Drag to position

### Connecting Nodes
1. Drag from output handle (right side)
2. Drop on input handle (left side)
3. Connection validates automatically

### Running Workflow
1. Connect all nodes
2. Upload images to Import nodes
3. Add prompt text
4. Click "Run Selected" button
5. Watch execution in real-time

## 🎨 Color Palette

```css
/* Backgrounds */
--bg-canvas: #000000;
--bg-sidebar: #0a0a0a;
--bg-node: #1a1a1a;
--bg-panel: #0f0f0f;

/* Borders */
--border-node: #2a2a2a;
--border-active: #3a3a3a;

/* Text */
--text-primary: #ffffff;
--text-secondary: #a0a0a0;
--text-muted: #666666;

/* Connections */
--connection-blue: #3b82f6;
--connection-orange: #f97316;
--connection-yellow: #eab308;
--connection-cyan: #06b6d4;

/* Accents */
--accent-primary: #8b5cf6;
--accent-success: #10b981;
--accent-error: #ef4444;
```

## 📁 File Structure

```
components/workflow-v2/
├── Canvas.tsx              # Main ReactFlow canvas
├── Sidebar.tsx             # Left toolbar
├── Topbar.tsx              # Top navigation
├── PropertiesPanel.tsx     # Right settings panel
├── RunControls.tsx         # Bottom execution panel
├── CustomEdge.tsx          # Gradient connections
└── nodes/
    ├── ImportNode.tsx      # Image import
    ├── PromptNode.tsx      # Text prompt
    ├── GenerateNode.tsx    # Gemini generation
    └── OutputNode.tsx      # Result display
```

## 🔧 Integration

### Gemini API
- Uses `lib/banana/api.ts` for generation
- Supports multiple reference images
- 16:9 aspect ratio for YouTube
- 2K resolution

### Supabase
- Image uploads to `source-images` bucket
- Public URLs for API calls
- Automatic cleanup

### Workflow Execution
- Uses `lib/workflow/executor.ts`
- Topological sort for node order
- Validates connections
- Error handling with toast notifications

## 🎯 Next Steps

1. **Get Gemini API Key**: https://aistudio.google.com/apikey
2. **Add to .env.local**: `GEMINI_API_KEY=your_key_here`
3. **Test Workflow**: Upload images, add prompt, run
4. **Download Results**: Click download button on Output node

## 🐛 Troubleshooting

### Nodes Not Appearing
- Check console for errors
- Verify node types are registered
- Refresh page

### Images Not Uploading
- Check Supabase configuration
- Verify storage buckets exist
- Check RLS policies

### Generation Failing
- Verify Gemini API key
- Check image URLs are accessible
- Review console logs

## 📚 Resources

- **ReactFlow Docs**: https://reactflow.dev/
- **Gemini API**: https://ai.google.dev/gemini-api/docs/image-generation
- **Framer Motion**: https://www.framer.com/motion/

---

**Status**: ✅ Complete redesign with Banana Skating UI
**Version**: 2.0
**Last Updated**: February 2026
