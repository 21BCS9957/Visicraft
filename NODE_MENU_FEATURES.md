# 🎛️ Node Menu Features

## Overview

Every node now has a **three-dot menu** (⋮) in the top-right corner with useful actions!

## How to Access

Click the **three vertical dots** (⋮) in any node's header to open the menu.

## Menu Options by Node Type

### 🔥 Generate Node

Click the ⋮ button to see:

| Option | Icon | Description | When Available |
|--------|------|-------------|----------------|
| **Download Image** | 📥 | Download the generated thumbnail | After generation completes |
| **Duplicate Node** | 📋 | Create a copy with same connections | Always |
| **Reset Node** | 🔄 | Clear result and reset to idle | After generation |
| **Delete Node** | 🗑️ | Remove node and all connections | Always |

**Download Image**: 
- Downloads the generated image as PNG
- Filename: `thumbnail-{timestamp}.png`
- Works with both base64 and URL images

**Duplicate Node**:
- Creates exact copy with +50px offset
- Copies all incoming connections
- Resets status to idle (no generated image)

**Reset Node**:
- Clears generated image
- Resets status to idle
- Keeps connections intact

---

### 📷 Import Node

Click the ⋮ button to see:

| Option | Icon | Description | When Available |
|--------|------|-------------|----------------|
| **Duplicate Node** | 📋 | Create a copy with same image | Always |
| **Clear Image** | 🔄 | Remove uploaded image | After upload |
| **Delete Node** | 🗑️ | Remove node and all connections | Always |

**Duplicate Node**:
- Creates copy with same uploaded image
- Copies all outgoing connections
- Useful for reusing same image

**Clear Image**:
- Removes uploaded image
- Resets node to empty state
- Keeps connections intact

---

### 💬 Prompt Node

Click the ⋮ button to see:

| Option | Icon | Description | When Available |
|--------|------|-------------|----------------|
| **Duplicate Node** | 📋 | Create a copy with same text | Always |
| **Clear Prompt** | 🔄 | Remove all text | When text exists |
| **Delete Node** | 🗑️ | Remove node and all connections | Always |

**Duplicate Node**:
- Creates copy with same prompt text
- Copies all outgoing connections

**Clear Prompt**:
- Removes all text from textarea
- Resets character count to 0

---

### 🖥️ Output Node

Click the ⋮ button to see:

| Option | Icon | Description | When Available |
|--------|------|-------------|----------------|
| **Download All** | 📥 | Download all displayed images | When images exist |
| **Duplicate Node** | 📋 | Create a copy | Always |
| **Clear Output** | 🔄 | Remove all images | When images exist |
| **Delete Node** | 🗑️ | Remove node and all connections | Always |

**Download All**:
- Downloads all images in sequence
- Each file: `thumbnail-{index}.png`
- Shows success toast with count

---

## Common Features

### Duplicate Node (All Nodes)
- **Keyboard shortcut**: Coming soon (Ctrl/Cmd + D)
- **Position**: New node appears 50px down and right
- **Connections**: Automatically duplicated
- **Data**: Copied from original (except generated results)

### Delete Node (All Nodes)
- **Color**: Red text to indicate danger
- **Effect**: Removes node AND all connected edges
- **Confirmation**: None (instant delete)
- **Undo**: Use browser back or reload (no undo yet)

### Reset/Clear (Context-Specific)
- **Generate**: Clears result, keeps connections
- **Import**: Clears image, keeps connections
- **Prompt**: Clears text, keeps connections
- **Output**: Clears images, keeps connections

---

## Menu Behavior

### Opening
- Click ⋮ button in node header
- Menu appears below button
- Smooth animation (fade + scale)

### Closing
- Click outside menu
- Click any menu option
- Click ⋮ button again

### Disabled Options
- Grayed out when not available
- Cursor shows "not-allowed"
- Example: "Download Image" before generation

---

## Visual Design

### Menu Style
- Dark background: `#1a1a1a`
- Border: `#2a2a2a`
- Hover: `#2a2a2a` background
- Shadow: Large shadow for depth

### Menu Items
- Icon + Text layout
- 4px icon size
- Smooth hover transitions
- Red color for delete action

### Animations
- Entry: Fade in + scale up
- Exit: Fade out + scale down
- Duration: 100ms
- Smooth and snappy

---

## Keyboard Shortcuts (Future)

Coming soon:
- `Ctrl/Cmd + D` - Duplicate selected node
- `Delete/Backspace` - Delete selected node
- `Ctrl/Cmd + R` - Reset selected node
- `Ctrl/Cmd + S` - Download (Generate/Output nodes)

---

## Examples

### Example 1: Download Generated Image
```
1. Generate a thumbnail
2. Click ⋮ in Generate node
3. Click "Download Image"
4. Image saves as thumbnail-{timestamp}.png
```

### Example 2: Duplicate Workflow
```
1. Set up Import → Generate → Output
2. Click ⋮ in each node
3. Click "Duplicate Node" for each
4. New workflow created with offset
```

### Example 3: Reset and Retry
```
1. Generation completes with bad result
2. Click ⋮ in Generate node
3. Click "Reset Node"
4. Adjust inputs and run again
```

### Example 4: Clean Up
```
1. Workflow getting messy
2. Click ⋮ on unwanted nodes
3. Click "Delete Node"
4. Connections automatically removed
```

---

## Tips & Tricks

### 💡 Quick Duplicate
Duplicate nodes to test different prompts or settings without losing your original setup.

### 💡 Batch Download
Use Output node's "Download All" to save multiple variations at once.

### 💡 Clean Slate
Use "Reset Node" instead of deleting when you want to keep connections but start fresh.

### 💡 Template Workflow
Create a template workflow, duplicate all nodes, and reuse the structure.

---

## Technical Details

### State Management
- Uses ReactFlow's `setNodes()` and `setEdges()`
- Immutable updates for proper re-rendering
- Toast notifications for user feedback

### Menu Implementation
- Framer Motion for animations
- Click-outside detection with refs
- Conditional rendering with AnimatePresence

### Download Implementation
- Handles both base64 and URL images
- Creates temporary blob URLs
- Automatic cleanup after download

### Duplicate Implementation
- Generates unique IDs with timestamp
- Copies node data (excluding results)
- Duplicates relevant connections
- Offsets position for visibility

---

## Files Modified

- ✅ `GenerateNode.tsx` - Added 4 menu options
- ✅ `ImportNode.tsx` - Added 3 menu options
- ✅ `PromptNode.tsx` - Added 3 menu options
- ✅ `OutputNode.tsx` - Added 4 menu options

---

## Future Enhancements

- [ ] Keyboard shortcuts
- [ ] Undo/Redo support
- [ ] Confirmation dialogs for delete
- [ ] Copy/Paste between workflows
- [ ] Export node as template
- [ ] Rename node option
- [ ] Color picker for nodes
- [ ] Lock node position
- [ ] Add notes/comments to nodes

---

## Status

✅ **All menu features implemented and working**
✅ **No TypeScript errors**
✅ **Smooth animations**
✅ **Proper state management**
✅ **Toast notifications**
✅ **Click-outside detection**
