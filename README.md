# Visicraft - AI-Powered Visual Content Generator

Transform your creative workflow with AI-powered image generation. Create stunning YouTube thumbnails, product photos, and marketing visuals in seconds.

## ✨ Features

- 🎨 **Visual Workflow Editor** - Drag-and-drop node-based interface with full zoom controls
- 🎬 **Animated Showcase** - GSAP-powered scroll animations demonstrating the workflow
- 🤖 **AI Generation** - Powered by Google Gemini & Banana Pro
- 📦 **Advanced Templates** - Pre-built workflows for common use cases
- 💳 **Credits System** - Pay-as-you-go pricing with flexible plans
- 🔐 **Secure Authentication** - Powered by Supabase
- 💰 **Payment Integration** - Razorpay for seamless transactions
- 📁 **File Manager** - Upload and manage workflow assets
- 🎯 **Smart UI** - Intelligent property panels that don't interrupt generation

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

Visit http://localhost:3000

## 📖 Documentation

### Setup & Configuration
- Full setup instructions
- Environment configuration
- Database setup
- Deployment guide
- Troubleshooting

### Workflow Canvas Features
- **Drag & Drop**: Drag nodes from sidebar directly to canvas
- **Zoom Controls**: +/- buttons in bottom-left corner, mouse wheel zoom, pinch on mobile
- **Grid Toggle**: Click Grid button to show/hide alignment grid
- **File Manager**: Upload and manage images via Files button
- **Auto-Zoom**: Canvas automatically fits view when adding nodes
- **Smart Properties**: Panel won't reopen during generation

### Template Library
- **Product Showcase**: 5 product photography styles
- **Viral Thumbnail Factory**: 4 emotion-driven thumbnails
- **Brand Universe Explorer**: 7 aesthetic universes
- **YouTube Thumbnail**: Optimized for video content
- **Meta Ads**: Social media advertising
- **Amazon Creative**: E-commerce product images
- **Shopify Creative**: Online store visuals

## 🔧 Environment Variables

Required variables in `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI Generation
GEMINI_API_KEY=

# Payments
NEXT_PUBLIC_RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Site
NEXT_PUBLIC_SITE_URL=
```

## 🏗️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, Tailwind CSS, Framer Motion
- **Workflow**: React Flow
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **AI**: Google Gemini, Banana Pro
- **Payments**: Razorpay
- **Deployment**: Vercel

## 📦 Project Structure

```
thumbnail-generator/
├── app/                    # Next.js pages and API routes
├── components/             # React components
│   ├── workflow-v2/       # Workflow editor
│   ├── shared/            # Shared components
│   └── ui/                # UI components
├── lib/                   # Utilities and helpers
│   ├── workflow/          # Workflow logic
│   └── supabase/          # Database clients
└── public/                # Static assets
```

## 🎯 Key Features

### Workflow Editor
- **Visual Interface**: Node-based drag-and-drop canvas
- **Drag & Drop Nodes**: Drag from sidebar to canvas at exact position
- **Zoom Controls**: +/- buttons, mouse wheel, pinch gestures
- **Grid System**: Toggle-able alignment grid (dots/lines)
- **File Manager**: Upload and preview images
- **Auto-Zoom**: Automatic view adjustment when adding nodes
- **Smart Properties**: Context-aware property panels
- **Real-time Execution**: Live workflow processing
- **Template Library**: Pre-built workflow templates
- **Auto-Organize**: Automatic node layout

### Node Types
- **Import Node**: Upload reference/source images (Orange/Blue)
- **Prompt Node**: Add text descriptions (Purple)
- **Generate Node**: AI image generation with settings (Red)
- **Output Node**: Display and download results (Gray)

### Generation Settings
- **Models**: Gemini 2 Flash, Gemini 3 Pro, Banana Pro
- **Aspect Ratios**: 16:9, 1:1, 4:3, 9:16, 21:9
- **Resolutions**: 720p, 1080p, 2K, 4K
- **Credit Cost**: Transparent pricing per generation

### Credits System
- 100 free credits for new users
- Transparent pricing (20-70 credits per generation)
- Real-time balance tracking
- Flexible payment plans
- Credit protection during generation

## 🎮 Usage Guide

### Adding Nodes (Drag & Drop)
1. Click **Nodes** button (Square icon) in left sidebar
2. **Drag** any node type from the panel
3. **Drop** it on the canvas where you want it
4. Canvas auto-adjusts to show the new node

### Using Zoom Controls
- **+/-** buttons in bottom-left corner
- **Mouse wheel** to zoom in/out (desktop)
- **Pinch** gesture on mobile/tablet
- **Fit View** button to show all nodes

### Toggling Grid
1. Click **Grid** button (Grid3x3 icon) in sidebar
2. Grid appears/disappears
3. Helps with node alignment

### Managing Files
1. Click **Files** button (FolderOpen icon) in sidebar
2. Click "Upload Image" or drag files
3. Files appear with preview thumbnails
4. Use in Import nodes

### Configuring Generation
1. Click a Generate node
2. Properties panel opens on the right
3. Select model, aspect ratio, resolution
4. Check credit cost
5. Click "Run This Node"
6. Panel stays open but won't interrupt during generation

### Building Workflows
1. Add Import nodes for images
2. Add Prompt node for text description
3. Connect to Generate node
4. Configure generation settings
5. Connect to Output node
6. Run workflow

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

### Environment Setup
- Configure Supabase database
- Set up authentication
- Add Razorpay payment keys
- Configure AI API keys

## 🐛 Troubleshooting

### Common Issues

**Login Issues**
- Check Supabase URL and keys
- Verify redirect URLs in Supabase dashboard
- Clear browser cache and cookies

**Generation Fails**
- Verify AI API keys (Gemini/Banana)
- Check credit balance
- Ensure images are uploaded correctly
- Verify node connections

**Payment Issues**
- Confirm Razorpay keys are correct
- Check webhook configuration
- Verify webhook secret matches

**Canvas Issues**
- Refresh page if nodes don't appear
- Use zoom controls to find nodes
- Check browser console for errors

## 📝 License

MIT License - see LICENSE file for details

## 🔗 Links

- **Live Demo**: https://visicraft-eta.vercel.app
- **Repository**: https://github.com/21BCS9957/Visicraft

## 🎉 Recent Updates

### Video Generation with Veo 3 API (Latest)
- ✅ **Veo 3 Integration**: Google's latest video generation model
- ✅ **Correct API Endpoints**: Using `veo-3.1-generate-001` model
- ✅ **Audio Support**: Native audio generation with videos
- ✅ **Improved UX**: Realistic timing expectations (2-3 minutes)
- ✅ **Background Processing**: Users can navigate away during generation
- ✅ **Better Error Handling**: Clear error messages and troubleshooting
- ✅ **Test Scripts**: Verify API access and configuration

### Animated Workflow Section - CREATIVE UX
- ✅ **Static Nodes**: Cards stay in place for clarity
- ✅ **Animated Lines**: Connection lines draw on scroll with glow effect
- ✅ **Interactive States**: Nodes activate with loading animations
- ✅ **Status Indicators**: "Uploading...", "Processing...", "Complete!"
- ✅ **Progress Rings**: Circular loading animations on active nodes
- ✅ **Particle Effects**: Glowing particles travel along connection lines
- ✅ **Success Badges**: Green checkmarks when nodes complete
- ✅ **Smooth Transitions**: 500ms color and scale transitions
- ✅ **Professional UX**: Inspired by modern SaaS design patterns

### Canvas Improvements
- ✅ **Drag & Drop**: Full drag-and-drop support for nodes
- ✅ **Zoom Controls**: Visible zoom buttons with mouse/touch support
- ✅ **Grid Toggle**: Functional grid button with visual feedback
- ✅ **File Manager**: Complete file upload and management system
- ✅ **Auto-Zoom**: Automatic view adjustment when adding nodes
- ✅ **Smart Properties**: Panel won't reopen during generation
- ✅ **Mobile Optimized**: Touch-friendly controls and responsive design

### Previous Updates
- Credit protection system
- Mobile optimization
- UX psychology improvements
- Payment flow enhancements
- Production login fixes
- Advanced workflow templates

---

Built with ❤️ using Next.js, React, and AI
