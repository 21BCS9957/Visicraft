# AI YouTube Thumbnail Generator

A modern web application that generates AI-powered YouTube thumbnails by combining user-uploaded images with a reference thumbnail style using the Banana Nano API.

## Features

- 🎨 **Multi-Image Upload**: Upload 1-10 source images with drag-and-drop
- 🖼️ **Reference Style**: Define thumbnail style with a reference image
- 🤖 **AI Generation**: Powered by Banana Nano API
- 📦 **Gallery View**: Display and download generated thumbnails
- 📜 **Generation History**: Track and revisit previous generations
- 🎯 **Modern UI**: Dark, premium aesthetic with smooth animations

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS 4
- **UI Components**: shadcn/ui
- **Backend**: Supabase (PostgreSQL + Storage)
- **AI**: Banana Nano API
- **Form Handling**: React Hook Form + Zod
- **File Upload**: react-dropzone

## Prerequisites

- Node.js 18+ and npm
- Supabase account
- Banana Nano API account

## Setup Instructions

### 1. Clone and Install

\`\`\`bash
cd thumbnail-generator
npm install
\`\`\`

### 2. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Create storage buckets:
   - Go to Storage → Create bucket → Name: `source-images` (Public)
   - Create another bucket → Name: `generated-thumbnails` (Public)

3. Create database table:

\`\`\`sql
CREATE TABLE generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  reference_image_url TEXT NOT NULL,
  source_images_urls TEXT[] NOT NULL,
  generated_thumbnails TEXT[] NOT NULL,
  prompt TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

4. Get your credentials:
   - Go to Settings → API
   - Copy `Project URL` and `anon public` key

### 3. Banana Nano API Setup

1. Sign up at [banana.dev](https://banana.dev)
2. Get your API key from the dashboard
3. The project uses Banana Pro model which only requires an API key (no model key needed)

### 4. Environment Variables

Update `.env.local` with your credentials:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
BANANA_API_KEY=your_banana_api_key
\`\`\`

### 5. Run Development Server

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

\`\`\`
thumbnail-generator/
├── app/
│   ├── api/
│   │   ├── generate/route.ts    # Banana API integration
│   │   └── upload/route.ts      # Supabase upload handler
│   ├── generate/page.tsx        # Main generator page
│   ├── history/page.tsx         # Generation history
│   ├── page.tsx                 # Home page
│   ├── layout.tsx               # Root layout
│   └── globals.css              # Global styles + animations
├── components/
│   ├── thumbnail-generator/
│   │   ├── image-upload-zone.tsx
│   │   ├── reference-upload.tsx
│   │   ├── generation-form.tsx
│   │   └── thumbnail-gallery.tsx
│   ├── shared/
│   │   └── navbar.tsx
│   └── ui/                      # shadcn components
│       ├── hero-section.tsx
│       ├── button.tsx
│       ├── card.tsx
│       └── ...
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── storage.ts
│   ├── banana/
│   │   └── api.ts
│   ├── utils.ts
│   └── validations.ts
└── types/
    └── index.ts
\`\`\`

## Usage

1. **Home Page**: View the hero section and navigate to generator
2. **Upload Reference**: Upload a thumbnail that defines your desired style
3. **Upload Sources**: Add 1-10 source images you want to transform
4. **Optional Prompt**: Add text instructions for customization
5. **Generate**: Click "Generate Thumbnails" and wait for AI processing
6. **Download**: View results and download individually or all at once
7. **History**: Access previous generations from the History page

## Customization

### Colors

The app uses a custom color palette defined in the design. Main colors:

- Background: `#1a1d18`, `#2a2e26`
- Text: `#f8f7f5`
- Accent: `#c8b4a0`
- Mid-tones: `#6b5545`, `#8a7060`

### Animations

Custom animations are defined in `globals.css`:
- `word-appear`: Fade in with blur effect
- `grid-draw`: Grid pattern fade in
- `pulse-glow`: Pulsing glow effect
- `float`: Floating animation

## Deployment

### Vercel (Recommended)

\`\`\`bash
npm run build
# Deploy to Vercel
\`\`\`

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

## Troubleshooting

### Upload Issues
- Ensure Supabase storage buckets are set to public
- Check file size limits (max 5MB per image)
- Verify accepted formats: JPG, PNG, WebP

### API Errors
- Verify Banana API credentials
- Check API rate limits
- Ensure model is properly configured

### Database Issues
- Verify table schema matches the SQL above
- Check Supabase connection credentials
- Review RLS policies if enabled

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
