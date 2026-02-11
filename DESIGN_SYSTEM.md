# Visicraft Design System Guide

Complete design system for AI to generate consistent components.

---

## 🎨 Color Palette

### Primary Colors (Dark Theme)
```css
Background: #0a0a0a (Pure Black)
Surface: #1a1a1a (Dark Gray)
Card: #0f0f0f (Slightly Lighter Black)
Border: rgba(255, 255, 255, 0.1) (10% White)
```

### Text Colors
```css
Primary Text: #ffffff (White)
Secondary Text: #e5e5e5 (Light Gray)
Muted Text: #a0a0a0 (Gray)
Disabled Text: #666666 (Dark Gray)
```

### Brand Colors (Warm Earthy Tones)
```css
Primary Brand: #8b7355 (Warm Brown)
Secondary Brand: #6b5545 (Dark Brown)
Accent: #c8b4a0 (Light Beige)
Hover: #8b7355/20 (20% Opacity)
```

### Node Colors (Workflow)
```css
Import Node (Reference): #f97316 (Orange)
Import Node (Source): #3b82f6 (Blue)
Prompt Node: #8b5cf6 (Purple)
Generate Node: #ef4444 (Red)
Output Node: #666666 (Gray)
```

### Semantic Colors
```css
Success: #10b981 (Green)
Error/Destructive: #ef4444 (Red)
Warning: #f59e0b (Amber)
Info: #06b6d4 (Cyan)
```

### Gradient Combinations
```css
Primary Gradient: from-[#8b7355] to-[#6b5545]
Accent Gradient: from-purple-500 to-pink-500
Glow Gradient: from-[#8b7355]/20 to-[#6b5545]/20
```

---

## 📐 Spacing System

### Base Unit: 4px (0.25rem)

```css
xs: 4px (0.25rem)
sm: 8px (0.5rem)
md: 12px (0.75rem)
base: 16px (1rem)
lg: 24px (1.5rem)
xl: 32px (2rem)
2xl: 48px (3rem)
3xl: 64px (4rem)
```

### Component Spacing
```css
Button Padding: px-4 py-2 (16px horizontal, 8px vertical)
Card Padding: p-6 (24px all sides)
Section Padding: px-6 (24px horizontal)
Container Max Width: max-w-7xl (1280px)
```

---

## 🔤 Typography

### Font Family
```css
Primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif
Monospace: 'Geist Mono', monospace
```

### Font Weights
```css
Light: 300 (font-light) - Used for headings and body
Normal: 400 (font-normal) - Default
Medium: 500 (font-medium) - Emphasis
Semibold: 600 (font-semibold) - Strong emphasis
Bold: 700 (font-bold) - Rarely used
```

### Font Sizes
```css
xs: 12px (0.75rem) - Captions, labels
sm: 14px (0.875rem) - Small text
base: 16px (1rem) - Body text
lg: 18px (1.125rem) - Large body
xl: 20px (1.25rem) - Small headings
2xl: 24px (1.5rem) - Medium headings
3xl: 30px (1.875rem) - Large headings
4xl: 36px (2.25rem) - Hero text
```

### Line Heights
```css
Tight: 1.25 (leading-tight)
Normal: 1.5 (leading-normal)
Relaxed: 1.75 (leading-relaxed)
```

### Letter Spacing
```css
Tight: -0.025em (tracking-tight)
Normal: 0 (tracking-normal)
Wide: 0.025em (tracking-wide)
Wider: 0.05em (tracking-wider)
```

---

## 🎯 Border Radius

```css
sm: 8px (0.5rem)
md: 12px (0.75rem)
lg: 16px (1rem)
xl: 20px (1.25rem)
2xl: 24px (1.5rem)
full: 9999px (rounded-full)
```

### Component Specific
```css
Buttons: 8px (rounded-lg)
Cards: 16px (rounded-xl)
Inputs: 8px (rounded-lg)
Modals: 16px (rounded-xl)
Nodes: 16px (rounded-2xl)
Avatar: 9999px (rounded-full)
```

---

## 🌟 Shadows

```css
/* Small Shadow */
shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05)

/* Default Shadow */
shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)

/* Medium Shadow */
shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)

/* Large Shadow */
shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)

/* Extra Large Shadow */
shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)

/* 2XL Shadow */
shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25)

/* Node Shadow */
Node Default: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)
Node Hover: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)
```

---

## 🎭 Component Patterns

### Button Variants

#### Primary Button
```tsx
className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white text-sm font-light tracking-wide hover:shadow-lg hover:shadow-[#8b7355]/20 transition-all"
```

#### Secondary Button
```tsx
className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-light transition-colors"
```

#### Ghost Button
```tsx
className="px-4 py-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white text-sm font-light transition-colors"
```

#### Icon Button
```tsx
className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#1a1a1a] hover:bg-[#222222] text-white transition-colors"
```

### Card Patterns

#### Basic Card
```tsx
className="bg-[#0f0f0f] border border-white/10 rounded-xl p-6 shadow-lg"
```

#### Hover Card
```tsx
className="bg-[#0f0f0f] border border-white/10 rounded-xl p-6 hover:border-white/20 hover:shadow-xl transition-all"
```

#### Gradient Card
```tsx
className="bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 border border-[#8b7355]/30 rounded-xl p-6"
```

### Input Patterns

#### Text Input
```tsx
className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white placeholder:text-[#666666] focus:outline-none focus:border-[#8b7355] transition-colors"
```

#### Textarea
```tsx
className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 text-white placeholder:text-[#666666] focus:outline-none focus:border-[#8b7355] resize-none"
```

### Modal/Panel Patterns

#### Side Panel
```tsx
className="fixed right-0 top-0 h-full w-80 bg-[#0a0a0a] border-l border-white/10 shadow-2xl z-50 overflow-y-auto"
```

#### Modal Overlay
```tsx
className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
```

#### Modal Content
```tsx
className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-xl p-6 shadow-2xl z-50"
```

---

## 🎬 Animations

### Transitions
```css
/* Default */
transition-all duration-200

/* Fast */
transition-all duration-150

/* Slow */
transition-all duration-300

/* Colors Only */
transition-colors duration-200

/* Transform Only */
transition-transform duration-200
```

### Hover Effects
```css
/* Scale Up */
hover:scale-110 transition-transform

/* Scale Down */
hover:scale-95 transition-transform

/* Lift */
hover:-translate-y-1 transition-transform

/* Glow */
hover:shadow-lg hover:shadow-[#8b7355]/20 transition-all
```

### Custom Animations
```css
/* Fade In */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Slide Up */
@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Pulse Glow */
@keyframes pulseGlow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* Float */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
```

---

## 🎨 Icon System

### Icon Library
- **Primary**: Iconify (@iconify/react)
- **Icon Set**: Phosphor Icons (ph:)
- **Size**: 16px (w-4 h-4) for inline, 20px (w-5 h-5) for buttons

### Icon Colors
```tsx
// Default
className="text-gray-400"

// Active
className="text-white"

// Brand
className="text-[#c8b4a0]"

// Node Specific
className="text-[#f97316]" // Orange
className="text-[#3b82f6]" // Blue
className="text-[#8b5cf6]" // Purple
className="text-[#ef4444]" // Red
```

---

## 📱 Responsive Breakpoints

```css
sm: 640px   /* Small devices */
md: 768px   /* Tablets */
lg: 1024px  /* Laptops */
xl: 1280px  /* Desktops */
2xl: 1536px /* Large screens */
```

### Mobile-First Approach
```tsx
// Mobile default, then scale up
className="text-sm md:text-base lg:text-lg"
className="px-4 md:px-6 lg:px-8"
className="hidden md:block" // Hide on mobile
className="block md:hidden" // Show only on mobile
```

---

## 🎯 Accessibility

### Focus States
```css
focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] focus:ring-offset-2 focus:ring-offset-[#0a0a0a]
```

### Touch Targets (Mobile)
```css
min-height: 44px
min-width: 44px
```

### Color Contrast
- Text on dark background: Minimum #a0a0a0 (Gray)
- Important text: #ffffff (White)
- Links: #c8b4a0 (Beige) with hover to #ffffff

---

## 🎨 Node Design System (Workflow)

### Node Structure
```tsx
<div className="min-w-[280px] bg-[#1a1a1a] border-2 border-[NODE_COLOR] rounded-2xl p-4 shadow-lg">
  {/* Header */}
  <div className="flex items-center gap-2 mb-3">
    <div className="w-8 h-8 rounded-lg bg-[NODE_COLOR]/20 flex items-center justify-center">
      <Icon className="w-4 h-4" style={{ color: NODE_COLOR }} />
    </div>
    <span className="text-white font-light text-sm">Node Title</span>
  </div>
  
  {/* Content */}
  <div className="space-y-2">
    {/* Node specific content */}
  </div>
</div>
```

### Handle (Connection Point)
```css
/* Base */
width: 12px
height: 12px
border-radius: 50%
border: 2px solid currentColor
background: transparent (not connected)
background: currentColor (connected)

/* Hover */
transform: scale(1.15)
box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.1)
```

---

## 🎨 Logo & Branding

### Logo Design
```tsx
<div className="w-10 h-10 rounded-2xl bg-[#8b7355] flex items-center justify-center">
  {/* Sparkle Icon */}
  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
    <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"/>
    <circle cx="18" cy="6" r="1.5"/>
    <circle cx="6" cy="18" r="1"/>
  </svg>
</div>
```

### Brand Name
```tsx
<span className="text-white font-light text-xl tracking-wider">
  Visicraft
</span>
```

---

## 📋 Component Checklist

When creating new components, ensure:

- [ ] Uses dark theme colors (#0a0a0a background)
- [ ] Text is white (#ffffff) or light gray (#e5e5e5)
- [ ] Borders use white/10 opacity
- [ ] Hover states have smooth transitions (200ms)
- [ ] Rounded corners (8px-16px)
- [ ] Font weight is light (300) or normal (400)
- [ ] Spacing follows 4px grid
- [ ] Icons are 16px or 20px
- [ ] Touch targets are 44px minimum on mobile
- [ ] Focus states are visible
- [ ] Gradients use brand colors (#8b7355 to #6b5545)
- [ ] Shadows are subtle (rgba(0, 0, 0, 0.3))

---

## 🎨 Example Component Templates

### Feature Card
```tsx
<div className="bg-[#0f0f0f] border border-white/10 rounded-xl p-6 hover:border-white/20 hover:shadow-xl transition-all">
  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#8b7355]/20 to-[#6b5545]/20 flex items-center justify-center mb-4">
    <Icon icon="ph:sparkle-fill" className="w-6 h-6 text-[#c8b4a0]" />
  </div>
  <h3 className="text-white font-light text-lg mb-2">Feature Title</h3>
  <p className="text-gray-400 text-sm font-light leading-relaxed">
    Feature description goes here with light font weight.
  </p>
</div>
```

### Stat Display
```tsx
<div className="bg-gradient-to-r from-[#8b7355]/20 to-[#6b5545]/20 border border-[#8b7355]/30 rounded-lg px-4 py-3">
  <div className="flex items-center gap-2">
    <Icon icon="ph:sparkle-fill" className="w-5 h-5 text-[#c8b4a0]" />
    <span className="text-2xl font-light text-white">1,234</span>
    <span className="text-sm text-gray-400">credits</span>
  </div>
</div>
```

### Action Button Group
```tsx
<div className="flex items-center gap-2">
  <button className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#8b7355] to-[#6b5545] text-white text-sm font-light tracking-wide hover:shadow-lg hover:shadow-[#8b7355]/20 transition-all">
    Primary Action
  </button>
  <button className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-light transition-colors">
    Secondary
  </button>
</div>
```

---

## 🎯 Design Principles

1. **Dark & Minimal**: Pure black (#0a0a0a) with subtle accents
2. **Light Typography**: Use font-light (300) for elegance
3. **Warm Accents**: Earthy browns (#8b7355) for brand identity
4. **Subtle Borders**: 10% white opacity for separation
5. **Smooth Transitions**: 200ms for all interactions
6. **Generous Spacing**: 24px (p-6) for breathing room
7. **Rounded Corners**: 16px (rounded-xl) for modern feel
8. **Gradient Highlights**: Use sparingly for emphasis
9. **Icon-First**: Visual icons before text labels
10. **Mobile-Friendly**: 44px touch targets, responsive text

---

## 🚀 Quick Reference

```tsx
// Colors
bg-[#0a0a0a]           // Background
bg-[#1a1a1a]           // Surface
border-white/10        // Border
text-white             // Primary text
text-gray-400          // Secondary text
from-[#8b7355]         // Brand gradient start
to-[#6b5545]           // Brand gradient end

// Spacing
p-6                    // Card padding
px-4 py-2              // Button padding
gap-2                  // Small gap
gap-4                  // Medium gap

// Typography
font-light             // Light weight (300)
text-sm                // Small text (14px)
tracking-wide          // Letter spacing

// Borders
rounded-lg             // 8px radius
rounded-xl             // 16px radius
border border-white/10 // Subtle border

// Effects
hover:bg-white/10      // Hover background
transition-all         // Smooth transition
shadow-lg              // Large shadow
```

---

**Use this guide to maintain visual consistency across all components!** 🎨✨
