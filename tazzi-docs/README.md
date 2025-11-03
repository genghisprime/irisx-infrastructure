# Tazzi API Documentation

**Status**: 🚧 IN PROGRESS (20% Complete)

Mintlify-based API documentation website for docs.tazzi.com

## What's Been Built

### ✅ Complete (20%)
- Mintlify project initialized (926 packages installed)
- mint.json configuration with Tazzi branding
- OpenAPI spec integrated (openapi.yaml)
- Directory structure created (pages/, guides/, webhooks/, api-reference/)
- Introduction page (pages/introduction.mdx)

### ⏳ Remaining (80%)
- Quick Start guide (pages/quickstart.mdx)
- Authentication guide (pages/authentication.mdx)
- API Keys guide (pages/api-keys.mdx)
- 5 Tutorial guides (guides/*.mdx)
- 3 Webhook pages (webhooks/*.mdx)
- API reference pages (auto-generated from OpenAPI)
- Deployment to S3/CloudFront
- DNS configuration for docs.tazzi.com

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

1. Complete core pages (Quick Start, Authentication, API Keys)
2. Create 5 guide tutorials
3. Create webhook documentation
4. Deploy to production (docs.tazzi.com)
5. Test all links and examples

**Estimated Time to Complete**: 4-5 hours remaining
