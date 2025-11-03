# Agent Desktop Production Deployment

**Date:** November 2, 2025
**Status:** ✅ DEPLOYED
**URL:** http://irisx-agent-desktop-prod.s3-website-us-east-1.amazonaws.com

---

## Deployment Summary

The IRISX Agent Desktop has been successfully deployed to AWS S3 with static website hosting enabled.

### Build Information

**Build Command:** `npm run build`
**Build Time:** 1.13 seconds
**Build Tool:** Vite 7.1.12

**Bundle Sizes:**
- JavaScript: 408.83 KB (117.15 KB gzipped)
- CSS: 8.01 KB (1.92 KB gzipped)
- Total: 409.8 KB (4 files)

**Files:**
```
dist/index.html                   1.35 kB
dist/assets/index-Dx0YeKsA.css    8.01 kB
dist/assets/index-DJw9_lhZ.js   408.83 kB
dist/vite.svg                     1.50 kB
```

---

## AWS S3 Configuration

**Bucket Name:** `irisx-agent-desktop-prod`
**Region:** us-east-1
**Access:** Public (read-only)

**Static Website Hosting:**
- Index document: `index.html`
- Error document: `index.html` (for SPA routing)

**Bucket Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::irisx-agent-desktop-prod/*"
    }
  ]
}
```

**Public Access Settings:**
```
BlockPublicAcls: false
IgnorePublicAcls: false
BlockPublicPolicy: false
RestrictPublicBuckets: false
```

---

## Features Deployed

### Core Functionality
- WebRTC softphone with SIP.js integration
- Real-time call controls (answer, hold, mute, transfer, hangup)
- Agent status management (available, busy, away, offline)
- Socket.io real-time updates for queue stats
- Call history and notes

### Technology Stack
- Vue 3.5 (Composition API)
- Tailwind CSS 4
- Vite 7 (build tool)
- Pinia (state management)
- Vue Router 4 (SPA routing)
- SIP.js 0.21.2 (WebRTC)
- Socket.io Client 4.7.0 (real-time)

### UI Components
- Login page with agent authentication
- Main softphone interface
- Dialpad
- Call timer
- Queue statistics panel
- Agent status indicator

---

## Deployment Steps (for reference)

1. **Build the application:**
   ```bash
   cd irisx-agent-desktop
   npm run build
   ```

2. **Create S3 bucket:**
   ```bash
   aws s3 mb s3://irisx-agent-desktop-prod
   ```

3. **Upload files:**
   ```bash
   aws s3 sync dist/ s3://irisx-agent-desktop-prod/ --delete
   ```

4. **Enable static website hosting:**
   ```bash
   aws s3 website s3://irisx-agent-desktop-prod/ \
     --index-document index.html \
     --error-document index.html
   ```

5. **Configure public access:**
   ```bash
   aws s3api put-public-access-block \
     --bucket irisx-agent-desktop-prod \
     --public-access-block-configuration \
     "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
   ```

6. **Apply bucket policy:**
   ```bash
   aws s3api put-bucket-policy \
     --bucket irisx-agent-desktop-prod \
     --policy file://bucket-policy.json
   ```

---

## Accessing the Application

**Current URL (S3):**
http://irisx-agent-desktop-prod.s3-website-us-east-1.amazonaws.com

**Test Credentials:**
- Use any agent account from your IRISX tenant
- API endpoint: `http://3.83.53.69:3000`

---

## Future Improvements

### 1. CloudFront CDN (Recommended)

**Benefits:**
- HTTPS support (required for WebRTC in production)
- Global edge locations (faster load times)
- Custom domain support
- Caching and performance optimization

**Steps:**
1. Create CloudFront distribution pointing to S3 bucket
2. Request SSL certificate via AWS Certificate Manager
3. Configure custom domain (agent.irisx.com)
4. Update DNS CNAME record

**Estimated Cost:** ~$1-2/month (first 1TB transfer free)

### 2. Custom Domain Setup

**Domain:** agent.irisx.com

**Steps:**
1. Create SSL certificate in ACM for agent.irisx.com
2. Validate domain ownership
3. Add CNAME record in Route 53 or DNS provider
4. Update CloudFront distribution with custom domain
5. Update API CORS allowed origins

### 3. CI/CD Pipeline

**Automation:**
- GitHub Actions workflow
- Build on push to main branch
- Automatic S3 sync
- CloudFront cache invalidation

**Example workflow:**
```yaml
name: Deploy Agent Desktop

on:
  push:
    branches: [main]
    paths:
      - 'irisx-agent-desktop/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: npm ci
        working-directory: irisx-agent-desktop
      - run: npm run build
        working-directory: irisx-agent-desktop
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: aws s3 sync dist/ s3://irisx-agent-desktop-prod/ --delete
        working-directory: irisx-agent-desktop
      - run: aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DISTRIBUTION_ID }} --paths "/*"
```

### 4. Monitoring & Analytics

**CloudWatch:**
- S3 access logs
- CloudFront request metrics
- Error rate monitoring

**Application Monitoring:**
- Sentry for error tracking (already integrated)
- Google Analytics or Plausible for usage metrics
- Custom WebRTC quality monitoring

---

## Troubleshooting

### Issue: CORS errors when accessing API

**Solution:** Ensure API server (3.83.53.69:3000) allows the S3 website URL in CORS origins:

```javascript
const ALLOWED_ORIGINS = [
  'http://irisx-agent-desktop-prod.s3-website-us-east-1.amazonaws.com',
  'https://agent.irisx.com', // future CloudFront URL
  // ... other origins
];
```

### Issue: WebRTC not working

**Cause:** WebRTC requires HTTPS in modern browsers (except localhost)

**Solution:**
1. Setup CloudFront with SSL certificate
2. Use custom HTTPS domain (agent.irisx.com)
3. For testing: Use localhost development server

### Issue: 404 on page refresh

**Cause:** S3 doesn't support SPA routing by default

**Solution:** Error document is set to index.html, which handles all routes via Vue Router

### Issue: Slow initial load

**Solutions:**
1. Enable CloudFront caching
2. Code splitting in Vite config
3. Lazy load routes
4. Optimize bundle size

---

## Security Considerations

### Current Setup (S3 Only)
- ⚠️ HTTP only (not suitable for production WebRTC)
- ✅ Public read-only access (appropriate for public app)
- ✅ No sensitive data in frontend bundle
- ✅ API authentication required

### Production Setup (CloudFront + HTTPS)
- ✅ HTTPS enforced
- ✅ WebRTC functional
- ✅ Custom domain with SSL
- ✅ Secure WebSocket connections

---

## Cost Analysis

**S3 Storage:**
- 0.41 MB stored
- Cost: ~$0.01/month (negligible)

**S3 Data Transfer:**
- Assuming 1,000 agent logins/month
- 409 KB × 1,000 = 409 MB/month
- Cost: ~$0.04/month (first 1GB free)

**CloudFront (if added):**
- First 1 TB free tier
- Estimated: ~$1-2/month after free tier

**Total Estimated Cost:** $0.05/month (S3 only) or $1-2/month (with CloudFront)

---

## Rollback Procedure

If deployment has issues:

1. **Revert to previous version:**
   ```bash
   # Upload backup dist folder
   aws s3 sync backup-dist/ s3://irisx-agent-desktop-prod/ --delete
   ```

2. **Disable bucket (emergency):**
   ```bash
   aws s3api delete-bucket-policy --bucket irisx-agent-desktop-prod
   ```

3. **Rebuild from source:**
   ```bash
   cd irisx-agent-desktop
   git checkout <previous-commit>
   npm run build
   aws s3 sync dist/ s3://irisx-agent-desktop-prod/ --delete
   ```

---

## Maintenance

**Update Procedure:**
1. Make changes to source code
2. Test locally: `npm run dev`
3. Build: `npm run build`
4. Deploy: `aws s3 sync dist/ s3://irisx-agent-desktop-prod/ --delete`
5. Test production URL
6. Invalidate CloudFront cache (if using CDN)

**Regular Tasks:**
- Monitor S3 access logs (monthly)
- Review bundle size after updates
- Test WebRTC functionality
- Update dependencies (quarterly)

---

## Contact & Support

**Repository:** /Users/gamer/Documents/GitHub/IRISX/irisx-agent-desktop
**Documentation:** See QUICKSTART.md, DEPLOYMENT_READY.md
**Deployed:** November 2, 2025
**Deployed By:** Claude (AI Assistant)
