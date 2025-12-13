# Deployment Guide for Netlify

## Quick Deploy (Recommended)

### Method 1: Netlify Drop (Easiest)

1. **Build the project locally:**
   ```bash
   npm install
   npm run build
   ```

2. **Deploy to Netlify:**
   - Go to [https://app.netlify.com/drop](https://app.netlify.com/drop)
   - Drag and drop the `out/` folder
   - Your site is live!

### Method 2: GitHub Integration (Best for Updates)

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Connect to Netlify:**
   - Log in to [Netlify](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Choose GitHub and select your repository
   - Build settings are already configured in `netlify.toml`
   - Click "Deploy site"

### Method 3: Netlify CLI

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login and deploy:**
   ```bash
   netlify login
   npm run build
   netlify deploy --prod --dir=out
   ```

## Build Configuration

The project is already configured for Netlify deployment:

- **Build command**: `npm run build`
- **Publish directory**: `out`
- **Configuration file**: `netlify.toml`

## Environment Variables

This project doesn't require any environment variables as all processing is done client-side.

## Custom Domain (Optional)

1. In Netlify dashboard, go to "Domain settings"
2. Click "Add custom domain"
3. Follow the instructions to configure DNS

## Continuous Deployment

With GitHub integration, every push to the `main` branch will trigger a new deployment automatically.

## Troubleshooting

### Build fails on Netlify

Check that all dependencies are in `package.json` (not `devDependencies` for production deps).

### Excel files not processing

This is a client-side app, so all Excel processing happens in the browser. Make sure the `xlsx` package is properly installed.

### Fonts not loading

Google Fonts are loaded via Next.js font optimization. If they don't load:
1. Check that `next.config.js` has `images: { unoptimized: true }`
2. Clear Netlify cache and redeploy

## Performance Optimization

The app is already optimized with:
- Static site generation (SSG)
- Client-side data processing
- Optimized images and fonts
- Minimal JavaScript bundle

## Support

For deployment issues, check:
- [Netlify Documentation](https://docs.netlify.com)
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
