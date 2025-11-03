# Agent Desktop - tazzi.com Domain Setup Guide

**Date:** November 2, 2025
**Domain:** agent.tazzi.com
**Status:** ⏳ Awaiting DNS Propagation (USER ACTION REQUIRED)

---

## Current Status

✅ **Completed:**
1. Route53 hosted zone created for tazzi.com
2. SSL certificate requested for agent.tazzi.com
3. DNS validation record added to Route53

⏳ **Waiting on YOU:**
- Update nameservers at Network Solutions (see below)

⏸️ **Will complete after DNS propagation:**
- SSL certificate validation
- CloudFront distribution creation
- Final deployment

---

## 🚨 IMMEDIATE ACTION REQUIRED

### Update Nameservers at Network Solutions

You need to update the nameservers for **tazzi.com** at Network Solutions to point to AWS Route53.

**Login to Network Solutions:**
1. Go to: https://www.networksolutions.com
2. Navigate to "My Domain Names"
3. Select "tazzi.com"
4. Find "Name Servers" or "DNS" settings
5. Change from current nameservers to these AWS nameservers:

```
ns-1513.awsdns-61.org
ns-54.awsdns-06.com
ns-1818.awsdns-35.co.uk
ns-804.awsdns-36.net
```

**Important Notes:**
- DNS propagation takes 24-48 hours after nameserver update
- The www.useiris.com redirect will continue working (we'll preserve it)
- All existing DNS records will need to be migrated to Route53

---

## AWS Resources Created

### 1. Route53 Hosted Zone
- **Zone ID:** Z08836013RY9F7RRF0CJ8
- **Domain:** tazzi.com
- **Nameservers:** (listed above)

### 2. SSL Certificate
- **ARN:** arn:aws:acm:us-east-1:895549500657:certificate/bd3d8290-46d3-4d76-835b-5ef1cbf7b92f
- **Domain:** agent.tazzi.com
- **Validation Method:** DNS
- **Status:** PENDING_VALIDATION (waiting for nameserver propagation)
- **Validation Record:**
  - Name: `_1ea557a87dbb1081f01eb3cda4bc4b86.agent.tazzi.com`
  - Type: CNAME
  - Value: `_997edd01911ce287486765f39ef016e1.jkddzztszm.acm-validations.aws`

### 3. S3 Bucket (Already exists)
- **Bucket:** irisx-agent-desktop-prod
- **Current URL:** http://irisx-agent-desktop-prod.s3-website-us-east-1.amazonaws.com
- **Status:** ✅ Deployed and working

---

## What Happens After DNS Propagation

Once you update the nameservers and DNS propagates (24-48 hours), the following will happen automatically:

### Phase 1: SSL Certificate Validation (Auto)
1. AWS will detect the validation CNAME record
2. Certificate status will change from PENDING_VALIDATION → ISSUED
3. Takes ~2-5 minutes after DNS propagates

### Phase 2: CloudFront Distribution (I'll do this)
I'll create a CloudFront distribution with:
- Origin: S3 bucket (irisx-agent-desktop-prod)
- SSL Certificate: agent.tazzi.com
- HTTPS: Enforced (redirect HTTP to HTTPS)
- Caching: Optimized for SPA
- Error pages: 404 → index.html (SPA routing)

### Phase 3: DNS A Record (I'll do this)
Add A record to point agent.tazzi.com to CloudFront:
```
agent.tazzi.com → CloudFront distribution (alias record)
```

### Phase 4: CORS Update (I'll do this)
Update API CORS to allow:
- https://agent.tazzi.com
- CloudFront URL

### Phase 5: Testing (We'll do together)
- Verify HTTPS works: https://agent.tazzi.com
- Test WebRTC functionality
- Confirm API calls work
- Validate SSL certificate in browser

---

## Preserving Existing tazzi.com Setup

**Current Setup:**
- tazzi.com redirects to www.useiris.com
- Hosted at Network Solutions

**After Migration:**
We'll preserve this by adding records in Route53:
```
# A record for tazzi.com root domain
tazzi.com → 301 redirect to www.useiris.com

# CNAME for www
www.tazzi.com → www.useiris.com (if applicable)
```

I'll help you set this up after nameservers propagate.

---

## Timeline

**Day 1 (Today):**
- ✅ Route53 hosted zone created
- ✅ SSL certificate requested
- ✅ DNS validation record added
- ⏳ YOU: Update nameservers at Network Solutions

**Days 2-3:**
- ⏳ DNS propagation (24-48 hours)
- ⏳ SSL certificate validates automatically

**Day 3-4 (After DNS propagates):**
- I'll create CloudFront distribution
- I'll add agent.tazzi.com A record
- I'll update CORS configuration
- We'll test together

**Final Result:**
- https://agent.tazzi.com (HTTPS, production-ready)
- WebRTC working
- Professional custom domain
- All existing tazzi.com functionality preserved

---

## Cost Impact

**New Costs:**
- Route53 hosted zone: $0.50/month
- CloudFront: ~$1-2/month (first 1TB free)
- SSL certificate: FREE (via AWS Certificate Manager)

**Total:** ~$1.50-2.50/month additional

---

## Checking DNS Propagation

After you update the nameservers, you can check propagation status:

**Command line:**
```bash
dig tazzi.com NS
```

**Online tools:**
- https://www.whatsmydns.net/#NS/tazzi.com
- https://dnschecker.org/#NS/tazzi.com

**When fully propagated, you'll see:**
- ns-1513.awsdns-61.org
- ns-54.awsdns-06.com
- ns-1818.awsdns-35.co.uk
- ns-804.awsdns-36.net

---

## Troubleshooting

### Issue: Nameservers not updating
**Cause:** Network Solutions can take 24-48 hours to process nameserver changes
**Solution:** Wait, check again tomorrow

### Issue: Existing site goes down
**Cause:** DNS records not migrated to Route53
**Solution:** I'll help migrate existing DNS records immediately

### Issue: SSL certificate stays PENDING_VALIDATION
**Cause:** DNS hasn't propagated yet
**Solution:** Wait for nameserver propagation, then certificate validates automatically

---

## Next Steps for YOU

1. **NOW:** Update nameservers at Network Solutions
   - Login to Network Solutions
   - Find tazzi.com
   - Change nameservers to the 4 AWS nameservers listed above

2. **Wait:** 24-48 hours for DNS propagation

3. **Notify me:** Once nameservers are updated, let me know
   - I'll monitor SSL certificate validation
   - I'll complete CloudFront setup
   - We'll test together

---

## Commands for Reference

**Check SSL certificate status:**
```bash
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:895549500657:certificate/bd3d8290-46d3-4d76-835b-5ef1cbf7b92f \
  --region us-east-1 \
  --query 'Certificate.Status'
```

**Check DNS records in Route53:**
```bash
aws route53 list-resource-record-sets \
  --hosted-zone-id Z08836013RY9F7RRF0CJ8
```

---

## Support

If you have any questions or issues:
1. Check this document first
2. Verify nameservers are updated at Network Solutions
3. Check DNS propagation status
4. Let me know if anything goes wrong

**Remember:** The current S3 deployment at http://irisx-agent-desktop-prod.s3-website-us-east-1.amazonaws.com continues to work while we wait for DNS!

---

**Created:** November 2, 2025
**Last Updated:** November 2, 2025
**Next Update:** After nameserver propagation
