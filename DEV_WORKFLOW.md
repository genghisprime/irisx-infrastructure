# Development Workflow - No More Cache Hell!

## Problem
CloudFront caching makes it painful to test frontend changes. After deploying to S3, you have to wait 5-15 minutes for cache invalidation to propagate.

## Solution: Local Development with Production API

### Quick Start

```bash
# In irisx-admin-portal directory
npm run dev
```

This will:
- Start Vite dev server on http://localhost:5173
- Point directly to production API at https://api.tazzi.com
- **NO CloudFront cache** - see changes instantly
- Hot module replacement - changes appear in real-time

### How It Works

1. **Local Dev Server**: Runs on your machine (localhost:5173)
2. **Production API**: Uses real production API (https://api.tazzi.com)
3. **No Cache**: Bypasses CloudFront entirely during development
4. **Hot Reload**: Vue changes appear instantly without refresh

### Environment Files

- `.env.local` - Used for local development (`npm run dev`)
- `.env` - Used for production builds (`npm run build`)

Vite automatically uses `.env.local` when running dev server.

### Complete Workflow

#### 1. Make Frontend Changes
```bash
cd irisx-admin-portal
npm run dev
# Make your changes - they appear instantly in browser
```

#### 2. Test Locally
- Browse to http://localhost:5173
- Test all your changes
- Use production data and API
- No cache delays!

#### 3. Deploy to Production (when ready)
```bash
# Build for production
npm run build

# Deploy to S3
aws s3 sync dist/ s3://tazzi-admin-portal-prod/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E2V7P9YRBU3YZV \
  --paths "/*"
```

### Backend Changes

For backend API changes, deploy as usual:

```bash
# Deploy updated backend file
scp -i ~/.ssh/irisx-prod-key.pem \
  /Users/gamer/Documents/GitHub/IRISX/api/src/routes/admin-cache.js \
  ubuntu@3.83.53.69:/home/ubuntu/irisx-backend/src/routes/

# Restart API
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 \
  "sudo lsof -ti:3000 | xargs -r sudo kill -9 && \
   cd /home/ubuntu/irisx-backend && \
   nohup node src/index.js > /tmp/api-cache-fix.log 2>&1 &"
```

Then test the backend changes in your local dev server - **no cache delay!**

### Alternative: Test with S3 Direct URLs

If you need to test the built version without CloudFront:

```bash
# Get S3 direct URL (bypasses CloudFront)
aws s3 website s3://tazzi-admin-portal-prod/ \
  --index-document index.html

# Access via S3 URL instead of CloudFront
# http://tazzi-admin-portal-prod.s3-website-us-east-1.amazonaws.com
```

### Pro Tips

1. **Always develop locally** - Use `npm run dev` for all testing
2. **Deploy only when done** - Only build and deploy when changes are final
3. **Use browser DevTools** - Network tab shows real API calls
4. **Test with real data** - Local dev uses production API and database

### Troubleshooting

**Port already in use?**
```bash
# Kill existing dev server
lsof -ti:5173 | xargs kill -9
```

**API CORS errors?**
- Production API already has CORS configured
- If issues persist, check browser console for details

**Changes not appearing?**
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Clear browser cache
- Restart dev server: Ctrl+C then `npm run dev`

## Summary

**Before**: Make change → Build → Deploy → Invalidate → Wait 15 min → Test → Repeat

**Now**: Make change → See it instantly → Test → Deploy when done

**Time saved**: Hours per day
