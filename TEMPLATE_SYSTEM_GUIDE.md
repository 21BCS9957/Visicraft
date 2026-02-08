# Template Workflow System - Complete Implementation Guide

## 🎯 System Overview

The template system provides pre-built workflows for common use cases, making it easy for users to get started quickly.

### User Flow:
1. User opens workflow page → Template modal appears
2. User selects from 5 template options
3. Template loads with pre-configured nodes and connections
4. User fills in their images/prompts
5. Generate node intelligently handles inputs
6. User clicks "Run" to generate

## 📋 Available Templates

### 1. Custom Workflow ⚡
- **Description**: Start from scratch with a blank canvas
- **Use Case**: Advanced users who want full control
- **Nodes**: None (blank canvas)

### 2. YouTube Thumbnail 🎬
- **Description**: Create eye-catching YouTube thumbnails
- **Use Case**: Content creators, YouTubers
- **Pre-configured**:
  - Source Image node (your photo/screenshot)
  - Reference Image node (optional style reference)
  - Prompt node (pre-filled with YouTube-optimized prompt)
  - Generate node (16:9 aspect ratio, 2K resolution)
  - Output node
- **Default Prompt**: "High-energy YouTube thumbnail with bold text overlay, dramatic lighting, vibrant colors"

### 3. Amazon Product 📦
- **Description**: Professional product images for Amazon listings
- **Use Case**: E-commerce sellers, Amazon vendors
- **Pre-configured**:
  - Source Image node (product photo)
  - Reference Image node (optional lifestyle reference)
  - Prompt node (Amazon-optimized)
  - Generate node (1:1 aspect ratio, 2K resolution)
  - Output node
- **Default Prompt**: "Professional Amazon product photo, clean white background, studio lighting, high quality, commercial photography"

### 4. Shopify Product 🛍️
- **Description**: E-commerce ready product images
- **Use Case**: Shopify store owners, online retailers
- **Pre-configured**:
  - Source Image node (product image)
  - Reference Image node (optional lifestyle scene)
  - Prompt node (e-commerce optimized)
  - Generate node (1:1 aspect ratio, 2K resolution)
  - Output node
- **Default Prompt**: "E-commerce product photo, lifestyle setting, soft natural lighting, minimal background"

### 5. Meta Ads Creative 📱
- **Description**: Facebook & Instagram ad visuals
- **Use Case**: Social media marketers, advertisers
- **Pre-configured**:
  - Source Image node (main image/product)
  - Reference Image node (optional ad style reference)
  - Prompt node (social media optimized)
  - Generate node (1:1 aspect ratio, 2K resolution)
  - Output node
- **Default Prompt**: "Facebook ad creative, attention-grabbing, scroll-stopping visual, vibrant colors, social media optimized"

## 🎨 Smart Generate Node Logic

The Generate node intelligently handles different input combinations:

### Scenario 1: Reference + Source + Prompt
**Full AI Transformation**
- Uses all three inputs for maximum control
- Reference provides style guidance
- Source provides base content
- Prompt adds specific instructions
- **Best for**: Complex transformations with specific style requirements

### Scenario 2: Source + Prompt Only
**AI Generation from Prompt**
- No reference image needed
- Source image is transformed based on prompt
- **Best for**: Creative transformations without style constraints

### Scenario 3: Reference + Source Only
**Style Transfer**
- No prompt needed
- Transfers style from reference to source
- **Best for**: Quick style matching

### Input Requirements:
- **Source Image**: REQUIRED (always needed)
- **Reference Image**: OPTIONAL
- **Prompt**: OPTIONAL
- **Validation**: At least Source + (Reference OR Prompt) needed

## 🏗️ Implementation Details

### Files Created:

1. **TemplateSelectionModal.tsx**
   - Location: `components/workflow-v2/TemplateSelectionModal.tsx`
   - Modal that shows on workflow page load
   - Grid of 5 template cards with icons and descriptions
   - Smooth animations and hover effects

2. **Template JSON Files**
   - Location: `lib/workflow/templates/`
   - `youtube-thumbnail.json`
   - `amazon-creative.json`
   - `shopify-creative.json`
   - `meta-ads.json`
   - Each contains pre-configured nodes and edges

3. **Template Loader Service**
   - Location: `lib/workflow/templateLoader.ts`
   - Loads template data
   - Returns nodes and edges for selected template
   - Handles "custom" (blank canvas) option

4. **Updated Components**
   - `Canvas.tsx`: Integrated template modal
   - `Topbar.tsx`: Added "New Workflow" button
   - `GenerateNode.tsx`: Already supports smart input handling

## 🚀 How to Use

### For Users:

1. **Open Workflow Page**
   - Navigate to `/workflow`
   - Template modal appears automatically

2. **Select a Template**
   - Click on any template card
   - Canvas loads with pre-configured nodes

3. **Fill in Your Content**
   - Upload images to Import nodes
   - Edit prompt text if needed
   - All nodes are pre-connected

4. **Generate**
   - Click "Run This Node" on Generate node
   - Or use Properties Panel to configure and run

5. **Start Fresh**
   - Click "New Workflow" button in topbar
   - Template modal reopens

### For Developers:

#### Adding a New Template:

1. **Create Template JSON**
```json
{
  "id": "my-template",
  "name": "My Template",
  "description": "Description here",
  "category": "category",
  "nodes": [
    // Node definitions
  ],
  "edges": [
    // Edge definitions
  ]
}
```

2. **Add to Template Loader**
```typescript
import myTemplate from './templates/my-template.json';

export const templates: Record<string, WorkflowTemplate> = {
  // ... existing templates
  'my-template': myTemplate as WorkflowTemplate,
};
```

3. **Add to Modal**
```typescript
const templates: Template[] = [
  // ... existing templates
  {
    id: 'my-template',
    name: 'My Template',
    description: 'Description here',
    icon: 'lucide:icon-name',
    category: 'category',
    gradient: 'from-color-500 to-color-600',
  },
];
```

## 🎯 Template Structure

### Node Positions:
- **Import Nodes (Left Column)**:
  - Reference: x: 100, y: 50
  - Source: x: 100, y: 200
  - Prompt: x: 100, y: 350

- **Generate Node (Center)**:
  - x: 500, y: 200

- **Output Node (Right)**:
  - x: 900, y: 200

### Edge Connections:
1. Reference → Generate (referenceImage handle)
2. Source → Generate (sourceImage handle)
3. Prompt → Generate (prompt handle)
4. Generate → Output (input handle)

## 💡 Best Practices

### Template Design:
1. **Keep it Simple**: 3-5 nodes maximum
2. **Pre-fill Prompts**: Provide optimized default prompts
3. **Logical Layout**: Left to right flow
4. **Clear Labels**: Descriptive node labels
5. **Optimal Settings**: Pre-configure aspect ratio and resolution

### Prompt Writing:
1. **Be Specific**: Include style, lighting, composition
2. **Use Keywords**: Platform-specific terms (YouTube, Amazon, etc.)
3. **Set Expectations**: Describe desired output clearly
4. **Keep it Concise**: 1-2 sentences maximum

### User Experience:
1. **Show Modal on Load**: Help users get started
2. **Allow Reopening**: "New Workflow" button
3. **Smooth Animations**: Stagger card appearances
4. **Clear Feedback**: Toast notifications on selection

## 🔧 Customization

### Changing Default Settings:

**Aspect Ratios**:
- YouTube: 16:9 (landscape)
- Products: 1:1 (square)
- Stories: 9:16 (vertical)

**Resolutions**:
- Standard: 2K (good balance)
- High Quality: 4K (premium)
- Fast: 1080p (quick generation)

### Modifying Prompts:

Edit the `text` field in template JSON:
```json
{
  "id": "prompt-1",
  "type": "prompt",
  "data": {
    "text": "Your custom prompt here",
    "label": "Prompt Label"
  }
}
```

## 📊 Template Analytics

Track which templates are most popular:
```typescript
// Add to template selection handler
const handleSelect = (templateId: string) => {
  // Track analytics
  analytics.track('template_selected', {
    template_id: templateId,
    template_name: template.name,
  });
  
  // Load template
  onSelectTemplate(templateId);
};
```

## 🐛 Troubleshooting

### Template Not Loading:
1. Check JSON syntax in template file
2. Verify template is imported in `templateLoader.ts`
3. Check console for errors

### Nodes Not Connected:
1. Verify edge `source` and `target` IDs match node IDs
2. Check handle names (referenceImage, sourceImage, prompt)
3. Ensure edge type is set to 'custom'

### Modal Not Showing:
1. Check `showTemplateModal` state in Canvas
2. Verify modal is rendered before Topbar
3. Check z-index (should be 50)

## 🎨 Styling

### Template Cards:
- Gradient backgrounds for visual appeal
- Hover effects with glow
- Smooth animations on load
- Clear selection state

### Icons:
- Using Iconify for consistency
- Lucide icons for most templates
- Phosphor icons for custom elements

### Colors:
- Custom: Gray (neutral)
- YouTube: Red (brand color)
- Amazon: Orange (brand color)
- Shopify: Green (brand color)
- Meta: Blue (brand color)

## 🚀 Future Enhancements

1. **Template Categories**: Group by use case
2. **Template Preview**: Show thumbnail before loading
3. **Save as Template**: Let users save their workflows
4. **Template Marketplace**: Share templates with community
5. **Template Variations**: Multiple versions per category
6. **Smart Suggestions**: Recommend templates based on usage

## 📝 Summary

The template system provides:
✅ 5 pre-built templates for common use cases
✅ Smart generate node with flexible input handling
✅ Beautiful modal with smooth animations
✅ Easy template creation and customization
✅ Professional UI matching your dark theme
✅ Seamless integration with existing workflow

This makes your platform 10x more user-friendly by providing ready-to-use templates while maintaining full flexibility!
