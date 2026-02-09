# Visicraft - AI-Powered Visual Content Generator

Transform your creative workflow with AI-powered image generation. Create stunning YouTube thumbnails, product photos, and marketing visuals in seconds.

## ✨ Features

- 🎨 **Visual Workflow Editor** - Drag-and-drop node-based interface
- 🤖 **AI Generation** - Powered by Google Gemini & Banana Pro
- 📦 **Advanced Templates** - Pre-built workflows for common use cases
- 💳 **Credits System** - Pay-as-you-go pricing with flexible plans
- 🔐 **Secure Authentication** - Powered by Supabase
- 💰 **Payment Integration** - Razorpay for seamless transactions

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

See [COMPLETE_GUIDE.md](./COMPLETE_GUIDE.md) for:
- Full setup instructions
- Environment configuration
- Database setup
- Deployment guide
- Troubleshooting

See [ADVANCED_WORKFLOW_TEMPLATES.md](./ADVANCED_WORKFLOW_TEMPLATES.md) for:
- Template usage guide
- Creative workflow patterns
- Best practices

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
- Visual node-based interface
- Real-time execution
- Template library
- Auto-organize nodes
- Grid customization

### Templates
- **Product Showcase**: 5 product photography styles
- **Viral Thumbnail Factory**: 4 emotion-driven thumbnails
- **Brand Universe Explorer**: 7 aesthetic universes

### Credits System
- 100 free credits for new users
- Transparent pricing
- Real-time balance tracking
- Flexible payment plans

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

See [COMPLETE_GUIDE.md](./COMPLETE_GUIDE.md) for detailed deployment instructions.

## 🐛 Troubleshooting

Common issues and solutions in [COMPLETE_GUIDE.md](./COMPLETE_GUIDE.md#troubleshooting)

## 📝 License

MIT License - see LICENSE file for details

## 🔗 Links

- **Live Demo**: https://visicraft-eta.vercel.app
- **Repository**: https://github.com/21BCS9957/Visicraft
- **Documentation**: [COMPLETE_GUIDE.md](./COMPLETE_GUIDE.md)

---

Built with ❤️ using Next.js, React, and AI
