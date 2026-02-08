# Flexible Generation System - Complete Guide

## 🎯 Overview

The Generate node now supports **flexible input combinations**, allowing you to create images with different setups based on what you have available.

## 📋 Supported Generation Modes

### Mode 1: Full Transformation (Recommended)
**Inputs**: Reference Image + Source Image + Prompt (optional)

**Use Case**: 
- You have a style reference and a source image
- Want to apply the reference style to the source
- Most control over the output

**Example**:
- Reference: Professional YouTube thumbnail
- Source: Your photo/screenshot
- Prompt: "Make it vibrant with dramatic lighting"
- Result: Your image styled like the reference

### Mode 2: Source + Prompt
**Inputs**: Source Image + Prompt (required)

**Use Case**:
- You only have one image
- Want to transform it based on text description
- No style reference needed

**Example**:
- Source: Product photo
- Prompt: "Professional Amazon product photo, white background, studio lighting"
- Result: Product transformed to match description

**How it works**: Source image is used as both reference and source internally

### Mode 3: Reference + Prompt
**Inputs**: Reference Image + Prompt (required)

**Use Case**:
- You have a style reference
- Want to generate based on that style
- No source image needed

**Example**:
- Reference: YouTube thumbnail style
- Prompt: "Create a gaming thumbnail with bold text and vibrant colors"
- Result: New image matching reference style

**How it works**: Reference image is used as both reference and source internally

## ✅ Validation Rules

### Required Inputs:
1. **At least ONE image** (reference OR source)
2. **If only one image**: Prompt is REQUIRED
3. **If both images**: Prompt is OPTIONAL

### Valid Combinations:
✅ Reference + Source + Prompt
✅ Reference + Source (no prompt)
✅ Source + Prompt
✅ Reference + Prompt

### Invalid Combinations:
❌ No images at all
❌ Only one image without prompt
❌ Only prompt without any image

## 🎨 How It Works

### Generate Node Logic:

```typescript
// Check what's available
const hasReferenceImage = !!data.referenceImageUrl;
const hasSourceImage = !!data.sourceImageUrl;
const hasPrompt = !!data.promptText;

// Validation
if (!hasReferenceImage && !hasSourceImage) {
  // Error: Need at least one image
}

if ((hasReferenceImage XOR hasSourceImage) && !hasPrompt) {
  // Error: One image requires prompt
}

// Build request based on available inputs
if (hasReferenceImage && hasSourceImage) {
  // Mode 1: Full transformation
  request = { referenceImage, sourceImages: [sourceImage], prompt }
} else if (hasSourceImage) {
  // Mode 2: Source + Prompt
  request = { 
    referenceImage: sourceImage,  // Use source as reference
    sourceImages: [sourceImage], 
    prompt 
  }
} else if (hasReferenceImage) {
  // Mode 3: Reference + Prompt
  request = { 
    referenceImage, 
    sourceImages: [referenceImage],  // Use reference as source
    prompt 
  }
}
```

## 📊 Use Case Examples

### Example 1: YouTube Creator
**Scenario**: Has a reference thumbnail they like + their own photo

**Setup**:
- Upload reference thumbnail to Reference Import node
- Upload their photo to Source Import node
- Add prompt: "High-energy gaming thumbnail"
- Connect all to Generate node

**Result**: Their photo styled like the reference thumbnail

### Example 2: Product Photographer
**Scenario**: Only has product photo, wants professional look

**Setup**:
- Upload product photo to Source Import node
- Add prompt: "Professional e-commerce photo, white background, studio lighting"
- Connect to Generate node

**Result**: Product photo transformed to professional style

### Example 3: Social Media Marketer
**Scenario**: Has ad reference, wants similar style

**Setup**:
- Upload reference ad to Reference Import node
- Add prompt: "Create Facebook ad creative, attention-grabbing, vibrant colors"
- Connect to Generate node

**Result**: New ad matching reference style

### Example 4: Designer
**Scenario**: Has both reference and source, wants specific changes

**Setup**:
- Upload style reference to Reference Import node
- Upload source image to Source Import node
- Add prompt: "Apply reference style but make it more vibrant and add dramatic shadows"
- Connect all to Generate node

**Result**: Source image with reference style plus prompt modifications

## 🔧 Technical Implementation

### Generate Node Validation:

```typescript
// Flexible validation
const hasReferenceImage = !!data.referenceImageUrl;
const hasSourceImage = !!data.sourceImageUrl;
const hasPrompt = !!data.promptText;

// Need at least one image
if (!hasReferenceImage && !hasSourceImage) {
  toast.error('Connect at least one image (reference or source)');
  return;
}

// If only one image, must have prompt
if ((hasReferenceImage && !hasSourceImage) || 
    (!hasReferenceImage && hasSourceImage)) {
  if (!hasPrompt) {
    toast.error('When using only one image, a prompt is required');
    return;
  }
}
```

### API Route Validation:

```typescript
// Flexible validation
const hasReference = !!referenceImage;
const hasSource = sourceImages && sourceImages.length > 0;

// Need at least one image
if (!hasReference && !hasSource) {
  return error('At least one image is required');
}

// If only one image type, prompt required
if ((hasReference && !hasSource) || (!hasReference && hasSource)) {
  if (!prompt) {
    return error('Prompt is required when using only one image');
  }
}
```

## 💡 Best Practices

### When to Use Each Mode:

**Full Transformation (Both Images)**:
- You have specific style reference
- You have specific source content
- Want maximum control
- Best quality results

**Source + Prompt**:
- You only have one image
- Want to transform existing image
- Have clear text description
- Quick transformations

**Reference + Prompt**:
- You have style example
- Want to generate new content
- No source image available
- Style-based generation

### Prompt Writing Tips:

**For Source + Prompt**:
- Be specific about desired style
- Mention lighting, colors, composition
- Example: "Professional product photo, white background, soft shadows, high quality"

**For Reference + Prompt**:
- Describe what to generate
- Reference the style implicitly
- Example: "Create a gaming thumbnail with bold text and vibrant colors"

**For Full Transformation**:
- Focus on modifications
- Reference handles style
- Example: "Make it more vibrant and add dramatic lighting"

## 🎯 User Experience

### Clear Error Messages:

**No images connected**:
```
"Connect at least one image (reference or source)"
```

**One image without prompt**:
```
"When using only one image, a prompt is required"
```

**API validation error**:
```
"At least one image (reference or source) is required"
"Prompt is required when using only one image"
```

### Console Logging:

```
📤 Mode: Full transformation (reference + source + prompt)
📤 Mode: Source + Prompt (using source as reference too)
📤 Mode: Reference + Prompt (using reference as source too)
```

## 📈 Benefits

### For Users:
✅ More flexible workflow
✅ Can work with what they have
✅ Don't need both images always
✅ Faster iterations
✅ More use cases supported

### For Platform:
✅ Better user experience
✅ More accessible
✅ Handles edge cases
✅ Clear validation
✅ Intuitive behavior

## 🚀 Future Enhancements

### Potential Additions:
1. **Prompt-only mode**: Generate from text alone
2. **Multiple sources**: Combine multiple images
3. **Style strength**: Control how much reference affects output
4. **Negative prompts**: Specify what to avoid
5. **Seed control**: Reproducible results

## ✅ Summary

The flexible generation system now supports:
- ✅ Full transformation (reference + source + prompt)
- ✅ Source + prompt (one image + description)
- ✅ Reference + prompt (style + description)
- ✅ Clear validation messages
- ✅ Intelligent fallbacks
- ✅ Better user experience

Users can now generate with whatever inputs they have available! 🎉
