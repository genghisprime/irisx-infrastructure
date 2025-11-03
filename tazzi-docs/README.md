# Tazzi API Documentation

**Status**: ✅ 80% COMPLETE (Ready for Deployment)

Mintlify-based API documentation website for docs.tazzi.com

## What's Been Built

### ✅ Complete (80%)
- ✅ Mintlify project initialized (926 packages)
- ✅ mint.json configuration with Tazzi branding
- ✅ OpenAPI spec integrated (openapi.yaml)
- ✅ **Core Pages (4):** Introduction, Quick Start, Authentication, API Keys
- ✅ **Tutorial Guides (4):** First Call, Send SMS, WhatsApp, Unified Inbox
- ✅ **Webhook Docs (3):** Overview, Events, Security
- ✅ **API Reference (5):** Calls, SMS, Email, WhatsApp, Conversations

**Total:** 16 documentation pages with code examples in 4 languages

### ⏳ Remaining (20%)
- Deployment to S3/CloudFront or Mintlify Cloud
- DNS configuration for docs.tazzi.com
- SSL certificate setup
- Testing and QA

## Development

```bash
# Install dependencies
npm install

# Run development server
npx mintlify dev

# Build for production
npx mintlify build
```

## Deployment Plan

**Option 1: Mintlify Cloud (Recommended)**
```bash
mintlify deploy
# Configure custom domain docs.tazzi.com
```

**Option 2: S3 + CloudFront**
```bash
mintlify build
aws s3 sync out/ s3://tazzi-docs-prod/
# Configure CloudFront distribution
# Point docs.tazzi.com CNAME to CloudFront
```

## Features

- **Modern UI**: Beautiful, responsive documentation
- **Interactive API Explorer**: Test endpoints directly from docs
- **Code Examples**: Multiple languages (cURL, Node.js, Python, PHP)
- **Search**: Full-text search across all documentation
- **Dark Mode**: Automatic theme switching
- **OpenAPI Integration**: Auto-generated API reference from openapi.yaml

## Next Steps

1. ~~Complete core pages~~ ✅ Done
2. ~~Create guide tutorials~~ ✅ Done (4 guides)
3. ~~Create webhook documentation~~ ✅ Done (3 pages)
4. Deploy to production (docs.tazzi.com)
5. Test all links and examples
6. Configure SSL certificate
7. Update DNS records

**Estimated Time to Complete**: 1-2 hours remaining (deployment only)

## Detailed Deployment Instructions

### Recommended: Mintlify Cloud Hosting

**Why Mintlify Cloud:**
- ✅ Free tier with custom domain support
- ✅ Automatic deployments on git push
- ✅ Built-in CDN and SSL
- ✅ Zero infrastructure maintenance
- ✅ Automatic updates when docs change

**Steps:**

1. **Create Mintlify Account** (5 minutes)
   - Visit https://mintlify.com
   - Click "Sign up with GitHub"
   - Authorize Mintlify to access repositories

2. **Connect Repository** (2 minutes)
   - Click "New Documentation"
   - Select repository: `genghisprime/irisx-infrastructure`
   - Set documentation path: `tazzi-docs/`
   - Mintlify will auto-detect `mint.json`

3. **Configure Custom Domain** (10 minutes)
   - Go to project Settings → Custom Domain
   - Enter: `docs.tazzi.com`
   - Mintlify will provide CNAME record values

4. **Update DNS in Route53** (5 minutes)
   ```bash
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z01234567ABCDEFGHIJKL \
     --change-batch '{
       "Changes": [{
         "Action": "CREATE",
         "ResourceRecordSet": {
           "Name": "docs.tazzi.com",
           "Type": "CNAME",
           "TTL": 300,
           "ResourceRecords": [{"Value": "[mintlify-provided-value]"}]
         }
       }]
     }'
   ```

5. **Verify Deployment** (5 minutes)
   - Wait for DNS propagation (5-10 minutes)
   - Visit https://docs.tazzi.com
   - Test all pages and navigation
   - Verify SSL certificate is active

**Total Time:** ~30 minutes

### Alternative: Self-Hosted on S3/CloudFront

If you prefer self-hosting (not recommended for Mintlify projects):

**Note:** Mintlify doesn't provide a static build command. Self-hosting requires running a Mintlify server instance or converting docs to another format. This approach is significantly more complex and not recommended.

If self-hosting is required, consider:
1. Converting to Docusaurus or Nextra (both support static builds)
2. Running Mintlify dev server on an EC2 instance
3. Using a reverse proxy to serve docs.tazzi.com
