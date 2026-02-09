# Visicraft - Complete Setup & Usage Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Supabase account
- Razorpay account (for payments)
- Google Gemini API key

### Installation

```bash
# Clone the repository
git clone https://github.com/21BCS9957/Visicraft.git
cd Visicraft/thumbnail-generator

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
```

---

## 🔧 Environment Setup

### 1. Supabase Configuration

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project or select existing
3. Get your credentials from Settings → API

Add to `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Important**: The service role key is required for payment processing!

### 2. Database Setup

Run the consolidated SQL script in Supabase SQL Editor:

**File**: `database-setup.sql`

This script will:
- Create `user_credits` table with RLS policies
- Create `generations` table for history
- Set up storage buckets and policies
- Create triggers for auto-crediting new users
- Add verification queries

Simply copy the entire contents of `database-setup.sql` and paste into Supabase SQL Editor, then click "Run".

### 3. Gemini API Setup

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key

Add to `.env.local`:
```env
GEMINI_API_KEY=your_gemini_api_key
```

### 4. Razorpay Setup

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Get your keys from Settings → API Keys
3. For production, switch to Live Mode

Add to `.env.local`:
```env
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

#### Optional: Webhook Setup (Recommended)

1. In Razorpay Dashboard → Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/api/payment/webhook`
3. Select event: `payment.captured`
4. Generate webhook secret

Add to `.env.local`:
```env
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

---

## 🏃 Running the Project

### Development
```bash
npm run dev
```
Visit: http://localhost:3000

### Production Build
```bash
npm run build
npm start
```

---

## 🎨 Features Guide

### 1. Workflow Editor

**Access**: Click "Workflow" in navbar

**Features**:
- Drag-and-drop node editor
- Multiple node types: Import, Prompt, Generate, Output
- Visual connections between nodes
- Real-time execution
- Template library

**Controls**:
- **Grid Button**: Toggle grid on/off, change grid style (Dots/Lines/Cross)
- **Organize Button**: Auto-arrange nodes in clean grid layout
- **Run Workflow**: Execute the workflow and generate images

**Node Types**:
1. **Import Node**: Upload reference/source images
2. **Prompt Node**: Write AI generation prompts
3. **Generate Node**: AI image generation (Gemini/Banana Pro)
4. **Output Node**: Download generated images

### 2. Advanced Templates

**Product Showcase** (150 credits)
- Generate 5 product photography styles
- Minimalist, Luxury, Lifestyle, Pop Art, Futuristic

**Viral Thumbnail Factory** (120 credits)
- 4 emotion-driven YouTube thumbnails
- Shock, Curiosity, Excitement, Controversy

**Brand Universe Explorer** (210 credits)
- 7 aesthetic universes for your brand
- Cyberpunk, Cottagecore, Vaporwave, Brutalist, Solarpunk, Dark Academia, Afrofuturism

### 3. Credits System

- New users get 100 free credits
- Credits deducted before generation
- Purchase more via Pricing page
- Track usage in History

**Credit Costs**:
- Gemini Flash: ~10 credits
- Banana Pro 2K: ~30 credits
- Banana Pro 4K: ~50 credits

### 4. Payment System

**Test Payment**: ₹1 test plan available
**Plans**: Starter (₹499), Creator (₹999), Pro (₹1999), Enterprise (Custom)
**Billing**: Monthly, Quarterly (-15%), Yearly (-20%)

---

## 🚢 Deployment (Vercel)

### 1. Push to GitHub
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Deploy on Vercel

1. Go to [Vercel Dashboard](https://vercel.com)
2. Import your GitHub repository
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Required for payments!
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET` (if using webhooks)
   - `NEXT_PUBLIC_SITE_URL` (your production URL)
4. Deploy

### 3. Configure Supabase Redirect URLs

In Supabase Dashboard → Authentication → URL Configuration:
- Add: `https://your-domain.vercel.app/auth/callback`
- Add: `http://localhost:3000/auth/callback` (for local dev)

---

## 🐛 Troubleshooting

### Payment Verification Failed

**Issue**: Credits not added after payment

**Solution**:
1. Check `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel
2. Verify Razorpay keys are correct (both from same mode)
3. Check Vercel logs for detailed errors
4. Ensure `user_credits` table exists with proper RLS policies

### Authentication Issues

**Issue**: Can't sign in on production

**Solution**:
1. Add production URL to Supabase redirect URLs
2. Set `NEXT_PUBLIC_SITE_URL` in Vercel
3. Check all Supabase credentials are set
4. Clear browser cache and cookies

### Generation Fails

**Issue**: Image generation not working

**Solution**:
1. Check credit balance
2. Verify `GEMINI_API_KEY` is valid
3. Ensure all required inputs are connected
4. Check browser console for errors

### Template Not Loading

**Issue**: Workflow template doesn't appear

**Solution**:
1. Restart dev server
2. Clear browser cache
3. Check template JSON syntax
4. Verify template is imported in `templateLoader.ts`

---

## 📊 Project Structure

```
thumbnail-generator/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── workflow/          # Workflow editor page
│   ├── pricing/           # Pricing page
│   └── ...
├── components/            # React components
│   ├── workflow-v2/       # Workflow editor components
│   ├── shared/            # Shared components (navbar, etc)
│   └── ui/                # UI components
├── lib/                   # Utilities and helpers
│   ├── workflow/          # Workflow execution logic
│   ├── supabase/          # Supabase clients
│   └── ...
└── public/                # Static assets
```

---

## 🔐 Security Best Practices

1. **Never commit** `.env.local` to git
2. **Service role key** should only be used in backend API routes
3. **Validate** all user inputs before processing
4. **Use RLS policies** in Supabase for data security
5. **Verify** Razorpay signatures for all payments
6. **Rate limit** API endpoints to prevent abuse

---

## 📈 Performance Tips

1. **Optimize images** before uploading
2. **Use lower resolution** for testing workflows
3. **Disable unused nodes** to save credits
4. **Batch similar operations** together
5. **Monitor credit usage** in History page

---

## 🆘 Getting Help

- Check browser console for errors
- Review Vercel deployment logs
- Check Supabase logs for database issues
- Test with ₹1 payment before going live
- Verify all environment variables are set

---

## 🎯 Next Steps

1. ✅ Complete environment setup
2. ✅ Run database setup SQL
3. ✅ Test locally with `npm run dev`
4. ✅ Deploy to Vercel
5. ✅ Add environment variables to Vercel
6. ✅ Test ₹1 payment
7. ✅ Configure webhooks (optional)
8. ✅ Go live!

---

## 📝 Credits & Attribution

- Built with Next.js 16, React 19, Tailwind CSS
- AI powered by Google Gemini
- Image generation by Banana Pro
- Authentication by Supabase
- Payments by Razorpay
- Deployed on Vercel

---

**Production URL**: https://visicraft-eta.vercel.app
**Repository**: https://github.com/21BCS9957/Visicraft

For issues or questions, check the troubleshooting section above.
