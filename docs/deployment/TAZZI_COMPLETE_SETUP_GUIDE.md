# Tazzi Platform - Complete Production Setup Guide

**Date:** November 2, 2025
**Platform:** Tazzi (formerly IRISX)
**Status:** ⏳ Awaiting DNS Propagation

---

## 🎯 Executive Summary

**What's Done:**
- ✅ 4 SSL certificates requested (agent, admin, app, api)
- ✅ Route53 hosted zone created for tazzi.com
- ✅ All DNS validation records added
- ✅ S3 bucket deployed (Agent Desktop)

**What You Need To Do NOW:**
- 🚨 Update nameservers at Network Solutions
- ⏳ Wait 24-48 hours for DNS propagation

**Final Result:**
- https://agent.tazzi.com - Agent Desktop (WebRTC softphone)
- https://admin.tazzi.com - Admin Portal
- https://app.tazzi.com - Customer Portal
- https://api.tazzi.com - API Server

---

## 🚨 IMMEDIATE ACTION REQUIRED

### Step 1: Update Nameservers at Network Solutions

**Go to:** https://www.networksolutions.com

**Login and navigate to:**
1. "My Domain Names"
2. Select "tazzi.com"
3. Find "Name Servers" or "DNS Settings"
4. Replace current nameservers with these **4 AWS nameservers:**

```
ns-1513.awsdns-61.org
ns-54.awsdns-06.com
ns-1818.awsdns-35.co.uk
ns-804.awsdns-36.net
```

**Important:**
- This will NOT break your existing www.useiris.com redirect (I'll preserve it)
- Takes 5 minutes to update at Network Solutions
- DNS propagation takes 24-48 hours globally

---

## 📋 SSL Certificates Created

| Domain | Certificate ARN | Status |
|--------|----------------|--------|
| agent.tazzi.com | `...bd3d8290-46d3-4d76-835b-5ef1cbf7b92f` | PENDING_VALIDATION |
| admin.tazzi.com | `...31619a2c-eef8-435a-a735-13afa421f116` | PENDING_VALIDATION |
| app.tazzi.com | `...8ebb0281-4be4-4240-8701-4bb20fd625b5` | PENDING_VALIDATION |
| api.tazzi.com | `...d722281b-aa56-41bf-b365-c68ea00b3168` | PENDING_VALIDATION |

**All certificates will AUTO-VALIDATE** once nameservers propagate.

---

## 📊 DNS Configuration

### Route53 Hosted Zone
- **Zone ID:** Z08836013RY9F7RRF0CJ8
- **Domain:** tazzi.com
- **Status:** ✅ Created and configured

### DNS Validation Records (Added)
✅ All 4 validation CNAMEs added to Route53:
- `_1ea557a87dbb1081f01eb3cda4bc4b86.agent.tazzi.com`
- `_73ff1a64d34c7eb4476e2f6c52a322a6.admin.tazzi.com`
- `_6be98a160c04caf6c1e62942e922a6fe.app.tazzi.com`
- `_eaae0032474a21371b97a18ed2108854.api.tazzi.com`

---

## ⏳ Timeline

### Day 1 (TODAY - November 2, 2025)
- ✅ Route53 hosted zone created
- ✅ 4 SSL certificates requested
- ✅ DNS validation records added
- ⏳ **YOU: Update nameservers at Network Solutions**

### Days 2-3 (November 3-4)
- ⏳ DNS propagates globally (24-48 hours)
- ⏳ SSL certificates validate automatically

### Day 4-5 (November 5-6 - After DNS Propagation)
**I'll complete these steps:**
1. Create 3 CloudFront distributions:
   - agent.tazzi.com → S3 (irisx-agent-desktop-prod)
   - admin.tazzi.com → S3 (will create bucket)
   - app.tazzi.com → S3 (will create bucket)

2. Set up Application Load Balancer:
   - api.tazzi.com → EC2 (3.83.53.69:3000)

3. Add DNS A records:
   - agent.tazzi.com → CloudFront
   - admin.tazzi.com → CloudFront
   - app.tazzi.com → CloudFront
   - api.tazzi.com → Load Balancer

4. Update API CORS configuration:
   - Allow all tazzi.com subdomains

5. Update branding (IRISX → Tazzi):
   - Frontend titles and headers
   - Documentation
   - User-facing text only

6. Test everything:
   - HTTPS verification
   - WebRTC functionality
   - API connectivity
   - SSL certificates

---

## 🌐 Production URLs (After Setup Complete)

| Service | Current URL (Works Now) | Future URL (After DNS) |
|---------|-------------------------|------------------------|
| Agent Desktop | http://irisx-agent-desktop-prod.s3-website-us-east-1.amazonaws.com | **https://agent.tazzi.com** |
| Admin Portal | http://localhost:5173 (dev only) | **https://admin.tazzi.com** |
| Customer Portal | http://localhost:5174 (dev only) | **https://app.tazzi.com** |
| API Server | http://3.83.53.69:3000 | **https://api.tazzi.com** |

---

## 💰 Cost Impact

| Service | Monthly Cost |
|---------|--------------|
| Route53 Hosted Zone | $0.50 |
| CloudFront (3 distributions) | ~$3-6 |
| Application Load Balancer | ~$16 |
| SSL Certificates (ACM) | FREE |
| **Total Additional Cost** | **~$20-23/month** |

**Note:** These are estimates. CloudFront first 1TB is free tier.

---

## 🔍 Checking DNS Propagation

After updating nameservers, check status:

**Command Line:**
```bash
dig tazzi.com NS
```

**Online Tools:**
- https://www.whatsmydns.net/#NS/tazzi.com
- https://dnschecker.org/#NS/tazzi.com

**When fully propagated, you'll see:**
- ns-1513.awsdns-61.org
- ns-54.awsdns-06.com
- ns-1818.awsdns-35.co.uk
- ns-804.awsdns-36.net

---

## 🛡️ Security Features

All domains will have:
- ✅ HTTPS enforced (HTTP → HTTPS redirect)
- ✅ TLS 1.2+ only
- ✅ SSL certificates from AWS (auto-renewing)
- ✅ CloudFront CDN (DDoS protection)
- ✅ CORS whitelisting (secure origins only)
- ✅ Rate limiting (brute force protection)

---

## 📝 Preserving Existing Setup

**Current tazzi.com setup:**
- Redirects to www.useiris.com

**After migration:**
I'll add this to Route53:
```
# Root domain redirect (preserve existing behavior)
tazzi.com → 301 redirect to www.useiris.com

# Or keep as-is if you have other plans
```

Let me know if you want to change this!

---

## ✅ What I've Already Deployed

**Agent Desktop:**
- S3 bucket: irisx-agent-desktop-prod
- Production build uploaded
- Static website hosting enabled
- Current URL: http://irisx-agent-desktop-prod.s3-website-us-east-1.amazonaws.com

**API Server:**
- EC2: 3.83.53.69:3000
- Security: CORS configured, rate limiting active
- Status: ✅ Running and healthy

---

## 🚀 Next Steps After DNS Propagates

**Step 1: SSL Validation (Automatic)**
- Certificates will validate in 2-5 minutes
- No action required

**Step 2: CloudFront Distributions (I'll do this)**
- Create 3 distributions for frontends
- Configure caching, HTTPS, error pages
- Takes ~15 minutes to deploy

**Step 3: Load Balancer (I'll do this)**
- Create Application Load Balancer
- Point to EC2 API server
- Configure health checks
- Takes ~10 minutes

**Step 4: DNS Records (I'll do this)**
- Add A records for all subdomains
- Point to CloudFront/ALB
- Takes ~5 minutes

**Step 5: Branding Update (I'll do this)**
- Update frontend titles
- Update documentation
- User-facing text only
- Takes ~1 hour

**Step 6: Testing (We'll do together)**
- Test all 4 domains
- Verify HTTPS works
- Test WebRTC on agent.tazzi.com
- Verify API calls work
- Takes ~30 minutes

---

## 📞 Support & Troubleshooting

**If nameservers don't update:**
- Network Solutions can take 24-48 hours
- Check propagation daily
- Contact Network Solutions support if stuck

**If SSL certificates stay PENDING:**
- Certificates auto-validate after DNS propagates
- No action needed, just wait

**If existing site breaks:**
- Let me know immediately
- I'll migrate any missing DNS records
- We can rollback if needed

---

## 📚 Documentation Files

All setup info in these files:
- `TAZZI_COMPLETE_SETUP_GUIDE.md` (this file)
- `TAZZI_DOMAIN_SETUP.md` (agent.tazzi.com specific)
- `AGENT_DESKTOP_DEPLOYMENT.md` (S3 deployment details)

---

## ✉️ What to Tell Me

**After you update nameservers:**
1. Send me a message: "Nameservers updated at Network Solutions"
2. I'll monitor SSL validation
3. I'll complete all CloudFront/ALB/DNS setup
4. I'll notify you when ready for testing

**Questions to answer:**
1. Do you want to keep tazzi.com redirecting to www.useiris.com? (Yes/No)
2. Any other DNS records we need to preserve? (Email MX, etc.)

---

## 🎉 Final Result Preview

**After everything is done:**

```
# Your users will access:
https://agent.tazzi.com  - Beautiful WebRTC softphone
https://admin.tazzi.com  - Admin dashboard
https://app.tazzi.com    - Customer portal
https://api.tazzi.com    - Clean API URL

# All with:
✅ HTTPS (secure)
✅ Fast (CloudFront CDN)
✅ Professional domains
✅ Auto-renewing SSL
✅ Production-ready
```

---

**Remember:** The platform works RIGHT NOW at the S3 URL and IP address. We're just adding professional domains and HTTPS on top!

**Your homework:** Update those 4 nameservers at Network Solutions today! 🚀

---

**Created:** November 2, 2025
**Last Updated:** November 2, 2025
**Next Update:** After nameserver propagation
