# Dark Theme Redesign - Complete Guide

## Overview
This document outlines the complete dark theme redesign inspired by the reference image, featuring a minimalist dark aesthetic with subtle brown/tan accents.

## Color Palette

### Primary Colors
- **Background**: `#0a0a0a` (Deep black)
- **Surface**: `#1a1a1a` (Card/panel background)
- **Border**: `rgba(255, 255, 255, 0.1)` (Subtle white borders)

### Text Colors
- **Primary Text**: `#e5e5e5` (Light gray)
- **Secondary Text**: `#a0a0a0` (Medium gray)
- **Muted Text**: `#666666` (Dark gray)
- **White**: `#ffffff` (Headings, emphasis)

### Accent Colors
- **Primary Accent**: `#8b7355` (Warm brown)
- **Secondary Accent**: `#6b5545` (Darker brown)
- **Accent Light**: `#c8b4a0` (Light tan)

## Typography

### Font Family
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
```

### Font Weights
- **Light**: 300 (Body text, descriptions)
- **Normal**: 400 (Standard text)
- **Medium**: 500 (Buttons, labels)
- **Semibold**: 600 (Headings)

### Letter Spacing
- Headings: `tracking-wide` (0.025em)
- Body: `tracking-normal` (0em)

## Component Styles

### Navbar
```tsx
<nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5">
  {/* Logo */}
  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#8b7355] to-[#6b5545]">
    <Sparkles className="w-4 h-4 text-white" />
  </div>
  
  {/* Nav Links */}
  <Link className="text-gray-400 hover:text-white hover:bg-white/5 px-4 py-2 rounded-lg">
    Home
  </Link>
  
  {/* Active Link */}
  <Link className="text-white bg-white/10 px-4 py-2 rounded-lg">
    Workflow
  </Link>
</nav>
```

### Buttons

#### Primary Button
```tsx
<button className="px-6 py-3 rounded-lg bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white font-light tracking-wide hover:shadow-lg hover:shadow-[#8b7355]/20 transition-all">
  Start Creating
</button>
```

#### Secondary Button
```tsx
<button className="px-6 py-3 rounded-lg bg-white/5 border border-white/10 text-white font-light hover:bg-white/10 transition-all">
  Learn More
</button>
```

#### Ghost Button
```tsx
<button className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
  Cancel
</button>
```

### Cards
```tsx
<div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 hover:border-white/20 transition-all">
  <h3 className="text-white font-light text-lg mb-2">Card Title</h3>
  <p className="text-gray-400 text-sm">Card description text</p>
</div>
```

### Input Fields
```tsx
<input className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-[#8b7355] focus:ring-1 focus:ring-[#8b7355] transition-all" />
```

### Hero Section
```tsx
<section className="min-h-screen flex items-center justify-center bg-[#0a0a0a] relative">
  {/* Grid Background */}
  <div className="absolute inset-0 opacity-[0.02]">
    <div className="absolute inset-0" style={{
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
      backgroundSize: '50px 50px'
    }} />
  </div>
  
  {/* Content */}
  <div className="relative z-10 text-center">
    <h1 className="text-6xl md:text-8xl font-light text-white tracking-wider mb-6">
      AI-POWERED<br/>
      YOUTUBE<br/>
      THUMBNAIL<br/>
      GENERATOR
    </h1>
    <p className="text-gray-400 text-lg font-light mb-8">
      Transform your images into stunning YouTube thumbnails with the power of AI
    </p>
    <button className="px-8 py-4 rounded-lg bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white font-light tracking-wide hover:shadow-lg hover:shadow-[#8b7355]/20 transition-all">
      <Sparkles className="inline w-5 h-5 mr-2" />
      Start Creating
    </button>
  </div>
</section>
```

### Feature Cards
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-8 hover:border-[#8b7355]/30 transition-all group">
    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 flex items-center justify-center mb-4">
      <Upload className="w-6 h-6 text-[#c8b4a0]" />
    </div>
    <h3 className="text-white font-light text-xl mb-2">Upload Images</h3>
    <p className="text-gray-400 text-sm font-light">
      Upload your source images and reference style
    </p>
  </div>
</div>
```

## Page-Specific Styles

### Homepage (/)
- Full-screen hero with grid background
- Large, spaced-out typography
- Minimal color usage
- Feature cards with hover effects

### Workflow Page (/workflow)
- Dark canvas background (#0a0a0a)
- Sidebar with dark panels (#0f0f0f)
- Nodes with subtle borders
- Connection lines with accent colors

### Generate Page (/generate)
- Two-column layout
- Form on left with dark inputs
- Preview on right with border
- Generate button with gradient

### Pricing Page (/pricing)
- Centered pricing cards
- Gradient accents on featured plan
- Clear typography hierarchy
- Subtle hover effects

## Implementation Checklist

### Global Styles ✅
- [x] Update globals.css with dark theme variables
- [x] Add custom scrollbar styles
- [x] Add selection color
- [x] Add utility classes

### Components
- [ ] Update Navbar with dark theme
- [ ] Update Hero Section
- [ ] Update Feature Cards
- [ ] Update Footer
- [ ] Update Form Components
- [ ] Update Button Components

### Pages
- [ ] Homepage redesign
- [ ] Workflow page styling
- [ ] Generate page styling
- [ ] Pricing page styling
- [ ] History page styling
- [ ] Login page styling

## Design Principles

1. **Minimalism**: Use space generously, avoid clutter
2. **Contrast**: High contrast between text and background
3. **Consistency**: Use the same spacing, colors, and typography throughout
4. **Subtlety**: Borders and accents should be subtle (10-20% opacity)
5. **Hierarchy**: Clear visual hierarchy with font sizes and weights
6. **Interactivity**: Smooth transitions and hover states
7. **Accessibility**: Maintain WCAG AA contrast ratios

## Animation Guidelines

### Transitions
```css
transition: all 0.2s ease;
```

### Hover Effects
- Scale: `hover:scale-105`
- Shadow: `hover:shadow-lg hover:shadow-[#8b7355]/20`
- Background: `hover:bg-white/10`
- Border: `hover:border-white/20`

### Page Transitions
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>
  {/* Content */}
</motion.div>
```

## Responsive Design

### Breakpoints
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

### Mobile Adjustments
- Reduce font sizes by 20-30%
- Stack layouts vertically
- Reduce padding/margins
- Hide non-essential elements
- Simplify navigation

## Next Steps

1. Update all component files with new styles
2. Test on different screen sizes
3. Verify accessibility
4. Optimize performance
5. Document any custom components

---

**Note**: This redesign prioritizes a clean, professional aesthetic that matches modern design trends while maintaining excellent usability and accessibility.
