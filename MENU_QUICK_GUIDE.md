# 🎯 Quick Guide - Node Menus

## What You'll See

Every node now has a **⋮** button in the top-right corner!

## Visual Example

```
┌──────────────────────┐
│ 🔥 Gemini Generate ⋮ │ ← Click the three dots!
├──────────────────────┤
│                      │
│   [Preview Area]     │
│                      │
└──────────────────────┘
```

## When You Click ⋮

A menu drops down:

```
┌──────────────────────┐
│ 🔥 Gemini Generate ⋮ │
├──────────────────────┤  ┌─────────────────┐
│                      │  │ 📥 Download     │
│   [Preview Area]     │  │ 📋 Duplicate    │
│                      │  │ 🔄 Reset        │
└──────────────────────┘  ├─────────────────┤
                          │ 🗑️ Delete       │
                          └─────────────────┘
```

## What Each Option Does

### 📥 Download Image
- Saves the generated thumbnail to your computer
- Only works after generation completes
- File name: `thumbnail-{timestamp}.png`

### 📋 Duplicate Node
- Makes a copy of the node
- Copies all connections too
- New node appears slightly offset

### 🔄 Reset Node
- Clears the result
- Keeps connections
- Ready to generate again

### 🗑️ Delete Node (Red)
- Removes the node
- Removes all connections
- **Careful!** No undo yet

## Try It Now!

1. Open `/workflow` in your browser
2. Add any node
3. Look for **⋮** in top-right corner
4. Click it
5. See the menu!

## All Nodes Have Menus

- **Generate Node**: Download, Duplicate, Reset, Delete
- **Import Node**: Duplicate, Clear Image, Delete
- **Prompt Node**: Duplicate, Clear Prompt, Delete
- **Output Node**: Download All, Duplicate, Clear Output, Delete

## Tips

💡 **Duplicate** is great for testing variations
💡 **Reset** lets you try again without reconnecting
💡 **Download** works for both Generate and Output nodes
💡 Click outside the menu to close it

## That's It!

Simple, powerful, and always available. Just click **⋮** on any node!
