# 💬 Prompt Feature Guide

## Overview

The Prompt node lets you add custom text instructions to guide the AI generation. It's **optional** but powerful for fine-tuning results!

## ✅ Prompt Feature Status

**Working**: Yes! The prompt feature is fully functional.

**Character Limit**: Increased from 500 to **2000 characters**

**Connection**: Automatically updates Generate node when connected

## How It Works

### Step 1: Add Prompt Node
1. Click the **Prompt** icon (💬) in the left sidebar
2. Drag it onto the canvas

### Step 2: Write Your Prompt
Type your instructions in the text area. Examples:
- "Make it vibrant with dramatic lighting"
- "Add bold text areas for titles"
- "Use warm colors and high contrast"
- "Create a cinematic look with depth of field"

### Step 3: Connect to Generate Node
1. Drag from Prompt node's **purple dot** (right side)
2. Connect to Generate node's **bottom cyan dot** (labeled "Prompt (optional) →")

### Step 4: Run Generation
The prompt will be included in the API call automatically!

## Why 2000 Characters?

### Previous Limit: 500 characters
- Too restrictive for detailed instructions
- Users couldn't describe complex requirements

### New Limit: 2000 characters
- ✅ Enough for detailed, multi-sentence prompts
- ✅ Room for specific style instructions
- ✅ Can describe multiple requirements
- ✅ Matches typical AI prompt lengths

### Why Not Unlimited?
- Gemini API has token limits
- Longer prompts = slower processing
- 2000 chars is ~300-400 words (plenty!)
- Keeps prompts focused and effective

## Technical Details

### How Prompt Updates Work

**Before (Broken)**:
```typescript
// Direct mutation - React doesn't detect changes
data.text = value;
```

**After (Fixed)**:
```typescript
// Proper state management
setNodes((nds) =>
  nds.map((node) =>
    node.id === id
      ? { ...node, data: { ...node.data, text: value } }
      : node
  )
);

// Also update connected Generate nodes
const connectedEdges = edges.filter(edge => edge.source === id);
setNodes((nds) =>
  nds.map((node) => {
    if (isConnected && node.type === 'generate') {
      return { ...node, data: { ...node.data, promptText: value } };
    }
    return node;
  })
);
```

### Data Flow

```
1. User types in Prompt node
   ↓
2. PromptNode updates its own data.text
   ↓
3. PromptNode finds connected Generate nodes
   ↓
4. Updates Generate node's data.promptText
   ↓
5. User clicks "Run Generation"
   ↓
6. GenerateNode uses data.promptText in API call
   ↓
7. API receives: { prompt: "user's text" }
```

### Console Logging

When you type in the Prompt node, you'll see:
```
🔗 Prompt updated, connected to: 1 node(s)
✅ Updated Generate node prompt: Make it vibrant with dramatic...
```

When you run generation:
```
🎯 Generate Node Data: {
  referenceImageUrl: '...',
  sourceImageUrl: '...',
  promptText: 'Make it vibrant with dramatic lighting'
}
📤 API Request: {
  prompt: 'Make it vibrant with dramatic lighting'
}
```

## Example Prompts

### Basic Style
```
Make it vibrant and eye-catching
```

### Detailed Instructions
```
Create a professional YouTube thumbnail with:
- Vibrant colors (blues and oranges)
- High contrast for visibility
- Space for bold text overlay
- Dramatic lighting from the left
- Shallow depth of field effect
```

### Specific Requirements
```
Transform this into a cinematic movie poster style:
- Dark, moody atmosphere
- Teal and orange color grading
- Add lens flare effects
- Emphasize the subject with rim lighting
- Create depth with atmospheric haze
```

### Technical Specifications
```
Generate a thumbnail optimized for YouTube:
- 16:9 aspect ratio
- High saturation for mobile viewing
- Clear focal point in center
- Complementary color scheme
- Professional studio lighting
```

## Tips for Better Prompts

### ✅ Do:
- Be specific about colors, lighting, mood
- Mention the intended use (YouTube, Instagram, etc.)
- Describe the atmosphere you want
- Reference specific styles (cinematic, minimalist, etc.)
- Use descriptive adjectives

### ❌ Don't:
- Write novels (keep it focused)
- Use vague terms like "make it good"
- Contradict yourself
- Include unrelated information
- Exceed 2000 characters

## Prompt is Optional!

If you don't connect a Prompt node, the system uses a default:
```
"Create a professional YouTube thumbnail"
```

This works fine for basic generations. Add a prompt when you want:
- Specific style or mood
- Custom color schemes
- Particular lighting effects
- Unique artistic direction

## Testing the Prompt Feature

### Test 1: Basic Connection
1. Add Prompt node
2. Type: "Make it vibrant"
3. Connect to Generate node (bottom cyan dot)
4. Check console for: "✅ Updated Generate node prompt"
5. Run generation
6. Check API request includes your prompt

### Test 2: Real-Time Updates
1. Connect Prompt to Generate first
2. Type in Prompt node
3. Watch console for updates
4. Each keystroke updates Generate node

### Test 3: Long Prompt
1. Write a 1000+ character prompt
2. Verify character counter shows correct count
3. Verify it doesn't exceed 2000 limit
4. Run generation with long prompt

## Troubleshooting

### "Prompt not being used"
**Check**:
1. Is Prompt node connected to Generate node?
2. Is it connected to the **bottom cyan dot**?
3. Check console for "✅ Updated Generate node prompt"
4. Check API request in console

### "Character limit too small"
**Fixed**: Limit increased to 2000 characters

### "Prompt not updating"
**Fixed**: Now uses proper state management with `setNodes()`

## API Integration

The prompt is sent to Gemini API as part of the request:

```typescript
const requestBody = {
  referenceImageUrl: '...',
  sourceImageUrls: ['...'],
  prompt: data.promptText || 'Create a professional YouTube thumbnail'
};
```

Gemini uses the prompt to:
- Guide the style transformation
- Apply specific effects
- Match the described mood
- Follow technical requirements

## Character Counter

The counter shows:
```
1234 / 2000 characters
```

- Updates in real-time as you type
- Turns red when approaching limit (future enhancement)
- Hard limit enforced with `maxLength={2000}`

## Future Enhancements

- [ ] Prompt templates/presets
- [ ] Prompt history
- [ ] AI-assisted prompt suggestions
- [ ] Prompt strength slider
- [ ] Save favorite prompts
- [ ] Import/export prompts
- [ ] Prompt library

## Summary

✅ **Prompt feature is working**
✅ **Character limit increased to 2000**
✅ **Real-time updates to Generate node**
✅ **Proper state management**
✅ **Console logging for debugging**
✅ **Optional but powerful**

The 500 character limit was arbitrary and too restrictive. The new 2000 character limit gives you plenty of room for detailed, effective prompts while staying within API limits!
