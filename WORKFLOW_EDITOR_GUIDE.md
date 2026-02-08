# 🎨 Visual Workflow Editor - User Guide

## Welcome to the Node-Based Thumbnail Generator!

The Workflow Editor provides a visual, intuitive way to create AI-powered thumbnails by connecting nodes on a canvas.

## 🚀 Quick Start

1. **Access the Editor**
   - Navigate to: http://localhost:3000/workflow
   - Or click "Workflow" in the navigation bar

2. **Add Nodes**
   - Click any node in the left palette to add it to the canvas
   - Drag nodes to reposition them

3. **Connect Nodes**
   - Click and drag from an output handle (right side) to an input handle (left side)
   - Connections are color-coded by data type

4. **Configure & Execute**
   - Upload images in Reference and Source nodes
   - Optionally add a prompt
   - Click "Run Workflow" to generate

## 📦 Node Types

### 1. Reference Image (Purple)
- **Purpose**: Defines the style for generation
- **Inputs**: None
- **Outputs**: Image URL
- **Usage**: Upload a thumbnail that represents your desired style

### 2. Source Image (Blue)
- **Purpose**: Content to transform
- **Inputs**: None
- **Outputs**: Image URL
- **Usage**: Upload the image you want to turn into a thumbnail

### 3. Prompt (Green)
- **Purpose**: Text description for customization
- **Inputs**: None
- **Outputs**: Text string
- **Usage**: Add optional text to guide the generation (e.g., "vibrant colors, professional")

### 4. Generate (Orange)
- **Purpose**: AI thumbnail generation
- **Inputs**: 
  - Reference Image (required)
  - Source Image (required)
  - Prompt (optional)
- **Outputs**: 
  - Generated Image
  - Metadata
- **Settings**:
  - Resolution: 1K, 2K, or 4K
  - Aspect Ratio: 16:9 (YouTube), 9:16 (Stories), 1:1 (Square), etc.

### 5. Output (Pink)
- **Purpose**: Display and download results
- **Inputs**: Generated Image
- **Outputs**: None
- **Features**:
  - Preview generated thumbnails
  - Download individual or all images
  - View generation metadata

## 🔗 Connection Rules

### Valid Connections
- ✅ Reference Image → Generate (reference input)
- ✅ Source Image → Generate (source input)
- ✅ Prompt → Generate (prompt input)
- ✅ Generate → Output (image input)

### Invalid Connections
- ❌ Image → Prompt (type mismatch)
- ❌ Output → Generate (wrong direction)
- ❌ Circular connections (creates loops)

## 🎯 Example Workflows

### Basic Workflow
```
[Reference Image] ──→ [Generate] ──→ [Output]
[Source Image] ────→ ↗
```

### Enhanced Workflow
```
[Reference Image] ──→ [Generate] ──→ [Output]
[Source Image] ────→ ↗
[Prompt] ──────────→ ↗
```

### Multi-Source Workflow
```
[Reference Image] ──→ [Generate 1] ──→ [Output 1]
[Source Image 1] ──→ ↗

[Reference Image] ──→ [Generate 2] ──→ [Output 2]
[Source Image 2] ──→ ↗
```

## ⌨️ Keyboard Shortcuts

- **Delete**: Remove selected nodes/connections
- **Scroll**: Zoom in/out
- **Space + Drag**: Pan canvas
- **Click + Drag**: Move nodes

## 🎨 Visual Feedback

### Node Status Colors
- **Gray border**: Idle (waiting)
- **Amber border + pulse**: Processing
- **Green border**: Complete
- **Red border**: Error

### Connection Colors
- **Blue**: Image data
- **Green**: Text/Prompt data
- **Purple**: Metadata

### Animations
- **Flowing dots**: Active connections during execution
- **Pulsing glow**: Node is processing
- **Scale on hover**: Interactive elements

## 💡 Tips & Best Practices

1. **Start Simple**
   - Begin with the basic workflow (Reference + Source + Generate + Output)
   - Add complexity as needed

2. **Upload First**
   - Upload all images before running the workflow
   - Wait for green checkmarks on image nodes

3. **Use Prompts Wisely**
   - Prompts are optional but can enhance results
   - Be specific: "vibrant colors, professional look" works better than "nice"

4. **Experiment with Settings**
   - Try different aspect ratios for different platforms
   - Higher resolution = better quality but slower generation

5. **Save Your Workflows**
   - Use the Save button to preserve complex workflows
   - Load templates for common use cases

## 🔧 Troubleshooting

### "Workflow must have at least one Generate node"
→ Add a Generate node from the palette

### "Generate node must have a Reference Image connected"
→ Connect a Reference Image node to the Generate node's reference input

### "Image must be uploaded before execution"
→ Wait for the green checkmark on image nodes before running

### "Generation failed"
→ Check that:
- All required connections are made
- Images are uploaded successfully
- Your Banana API key is configured

### Nodes won't connect
→ Ensure you're connecting:
- Output (right side) to Input (left side)
- Compatible data types (image to image, text to text)

## 🆚 Workflow vs. Form Interface

### Use Workflow Editor When:
- You want visual understanding of the process
- Working with multiple source images
- Experimenting with different configurations
- Building reusable workflows
- Need to see the data flow

### Use Form Interface When:
- Quick one-off generations
- Simple use case (1 reference + 1 source)
- Prefer traditional form inputs
- Mobile device (workflow is desktop-optimized)

## 🎓 Learning Path

1. **Beginner**: Create basic workflow (Reference + Source + Generate + Output)
2. **Intermediate**: Add prompts and experiment with settings
3. **Advanced**: Build multi-source workflows and save templates
4. **Expert**: Create complex pipelines with multiple generations

## 🚀 Next Features (Coming Soon)

- [ ] Workflow templates library
- [ ] Batch processing multiple sources
- [ ] Workflow sharing via URL
- [ ] Version history
- [ ] Auto-layout button
- [ ] Workflow export/import
- [ ] Collaborative editing

## 📚 Additional Resources

- **Nano Banana API Docs**: https://docs.nanobananaapi.ai/
- **ReactFlow Docs**: https://reactflow.dev/
- **Project README**: See `README.md` for setup instructions

## 💬 Need Help?

- Check the console (F12) for detailed error messages
- Review the `WORKFLOW_IMPLEMENTATION_PLAN.md` for technical details
- Ensure Supabase and Banana API are properly configured

---

**Enjoy creating amazing thumbnails with the visual workflow editor!** 🎨✨
