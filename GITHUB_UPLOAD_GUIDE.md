# 🚀 GitHub Upload Guide - Visicraft

## Step-by-Step Instructions

### 1. Add All Files to Git

```bash
cd thumbnail-generator
git add .
```

### 2. Commit Your Changes

```bash
git commit -m "Initial commit: Complete AI Creative Studio with workflow editor, pricing page, and Gemini integration"
```

### 3. Add the GitHub Remote

```bash
git remote add origin https://github.com/21BCS9957/Visicraft.git
```

### 4. Push to GitHub

```bash
git branch -M main
git push -u origin main
```

## If You Get Authentication Errors

### Option 1: Use Personal Access Token (Recommended)

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Select scopes: `repo` (full control)
4. Copy the token
5. When prompted for password, paste the token

### Option 2: Use SSH

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to ssh-agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub: Settings → SSH and GPG keys → New SSH key

# Change remote to SSH
git remote set-url origin git@github.com:21BCS9957/Visicraft.git
git push -u origin main
```

## Complete Command Sequence

```bash
# Navigate to project
cd thumbnail-generator

# Stage all files
git add .

# Commit
git commit -m "Initial commit: Complete AI Creative Studio

Features:
- Workflow editor with node-based interface
- Gemini AI integration for thumbnail generation
- Pricing page with 4 tiers
- Supabase integration for storage
- Dark cyber-luxury UI design
- Responsive design
- Full TypeScript support"

# Add remote
git remote add origin https://github.com/21BCS9957/Visicraft.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## What Will Be Uploaded

### Core Application
- ✅ Next.js 14 app with TypeScript
- ✅ Workflow editor (ReactFlow-based)
- ✅ Pricing page
- ✅ Generation pages
- ✅ History page
- ✅ API routes

### Components
- ✅ Workflow nodes (Import, Prompt, Generate, Output)
- ✅ Properties panel with dropdowns
- ✅ Sidebar and topbar
- ✅ UI components

### Features
- ✅ Gemini API integration
- ✅ Supabase storage
- ✅ Image upload and generation
- ✅ Node menus (download, duplicate, delete)
- ✅ Connection labels
- ✅ Prompt feature (2000 chars)

### Documentation
- ✅ 30+ markdown guides
- ✅ Setup instructions
- ✅ Troubleshooting guides
- ✅ Feature documentation

## Files That Won't Be Uploaded (Gitignored)

- ❌ `node_modules/` (dependencies)
- ❌ `.next/` (build files)
- ❌ `.env.local` (secrets)
- ❌ `.DS_Store` (Mac files)

## After Upload

### Update README.md

Add this to your GitHub repository:

```markdown
# 🎨 Visicraft - AI Creative Studio

Generate stunning visuals for YouTube, Amazon, and social media with AI.

## Features

- 🎬 **Workflow Editor**: Node-based visual programming
- 🤖 **AI Generation**: Powered by Google Gemini
- 💰 **Pricing Plans**: 4 tiers from Starter to Enterprise
- 🎨 **Dark UI**: Cyber-luxury aesthetic
- 📱 **Responsive**: Works on all devices

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- Framer Motion
- ReactFlow
- Supabase
- Google Gemini API

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

Visit `http://localhost:3000`

## Environment Variables

Create `.env.local`:

\`\`\`
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
GEMINI_API_KEY=your_gemini_key
\`\`\`

## Documentation

See `/docs` folder for detailed guides.

## License

MIT
```

### Add Topics to Repository

On GitHub, add these topics:
- `nextjs`
- `typescript`
- `ai`
- `gemini`
- `workflow-editor`
- `thumbnail-generator`
- `reactflow`
- `supabase`
- `tailwindcss`
- `framer-motion`

### Create a .gitignore (if not exists)

```
# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local
.env

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

## Troubleshooting

### "Repository not found"
Make sure the repository exists on GitHub first. Create it at:
https://github.com/new

### "Permission denied"
Use personal access token or SSH key (see above)

### "Large files"
If you have large files, use Git LFS:
```bash
git lfs install
git lfs track "*.psd"
git add .gitattributes
```

### "Merge conflicts"
If the repo already has files:
```bash
git pull origin main --allow-unrelated-histories
# Resolve conflicts
git push origin main
```

## Verify Upload

After pushing, visit:
https://github.com/21BCS9957/Visicraft

You should see all your files!

## Next Steps

1. ✅ Upload to GitHub
2. 🚀 Deploy to Vercel
3. 📝 Update README with live demo link
4. 🎯 Add screenshots
5. 📊 Set up GitHub Actions for CI/CD
6. 🔒 Add security scanning
7. 📈 Add analytics

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts
```

Or connect GitHub repo to Vercel dashboard:
https://vercel.com/new

## Success! 🎉

Your project is now on GitHub and ready to share with the world!
