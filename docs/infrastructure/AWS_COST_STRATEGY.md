# IRISX AWS Cost Strategy

## Philosophy: Start Lean, Scale with Revenue

**Goal:** Minimize infrastructure costs during development and early launch. Scale UP only when load and revenue justify it.

---

## Phase 0-1: Development & Beta (Weeks 1-12)

### Compute (EC2)
- **API Server:** `t3.small` - Hono.js API + NATS + Workers
  - 2 vCPUs, 2 GB RAM
  - Cost: ~$15/mo
  - **Upgrade trigger:** API response times >500ms OR CPU >70% consistently

- **FreeSWITCH Server:** `t3.small` - Telephony engine only
  - 2 vCPUs, 2 GB RAM
  - Cost: ~$15/mo
  - **Upgrade trigger:** >50 concurrent calls OR CPU >70% consistently

- **Total EC2 Cost:** $30/mo (2 instances)
- **Why separate?** Better reliability, easier scaling, cleaner architecture

### Database (RDS PostgreSQL)
- **Instance Type:** `db.t4g.micro` (ARM-based, cheapest option)
  - 2 vCPUs, 1 GB RAM
  - Cost: ~$12-13/mo (vs $15/mo for db.t3.micro)
  - Storage: 20 GB GP3 SSD (start small, auto-scale enabled)
  - **Upgrade trigger:** Storage >80% OR connections >80 OR slow queries
  - **Why not Aurora?** Aurora Serverless v2 starts at ~$45/mo minimum (0.5 ACU × 730 hrs). We'll migrate to Aurora when we need:
    - Auto-scaling during traffic spikes
    - Read replicas for scale
    - Multi-region replication
    - Revenue justifies the cost ($5,000+ MRR)

### Cache (ElastiCache Redis)
- **Instance Type:** `cache.t4g.micro` (ARM-based)
  - Cost: ~$11-12/mo (vs $15/mo for cache.t3.micro)
  - 0.5 GB RAM (sufficient for session cache, rate limiting)
  - **Upgrade trigger:** Memory >80% OR evictions occurring

### Storage (S3)
- **Standard tier** for active recordings
- **Lifecycle policy:** Move to Intelligent-Tiering after 30 days
- Cost: ~$1-2/mo initially
- **No S3 Glacier initially** - add later when archive needs grow

### CDN (CloudFront)
- **Skip CloudFront in Phase 0-1** - Add in Phase 2+ when needed
- Direct S3 access is fine for development
- Cost savings: ~$5-10/mo
- **Add trigger:** Users complaining about media load times

---

## Revised Startup Costs (Lean Approach)

| Service | Original Plan | **LEAN Plan** | Savings |
|---------|---------------|---------------|---------|
| EC2 (t3.medium) | $30/mo | **$30/mo** (2× t3.small, separated) | $0 |
| RDS PostgreSQL | $15/mo | **$12/mo** (db.t4g.micro) | -$3/mo |
| ElastiCache Redis | $12/mo | **$11/mo** (cache.t4g.micro) | -$1/mo |
| S3 + CloudFront | $5/mo | **$2/mo** (S3 only) | -$3/mo |
| **TOTAL** | **$62/mo** | **$55/mo** | **-$7/mo (11% savings)** |

**Note:** We're using 2× t3.small (API + FreeSWITCH separated) instead of 1× combined for better scalability and reliability.

**Additional savings opportunities:**
- Use AWS Free Tier (12 months) for eligible services
- Reserved Instances (1-year) after confirming workload = 30-40% savings
- Spot Instances for non-critical workers = 60-90% savings

---

## Scaling Triggers (When to Upgrade)

### EC2: Upgrade from t3.small → t3.medium
**Triggers:**
- Concurrent calls consistently >50
- CPU utilization >70% for >1 hour
- FreeSWITCH showing audio quality issues
- API response times >500ms p95

**Next tier:** t3.medium ($30/mo) → t3.large ($60/mo)

### RDS: Upgrade from db.t4g.micro → db.t4g.small
**Triggers:**
- Database connections >80 (t4g.micro max ~100)
- Query times increasing (slow query log shows issues)
- CPU >70% consistently
- Storage >80% (auto-scale will help, but watch costs)

**Next tier:** db.t4g.small ($25/mo) → db.t4g.medium ($50/mo) → **Aurora PostgreSQL** (~$90/mo for 2 ACU minimum)

**When to migrate to Aurora:**
- Need read replicas (horizontal scaling)
- Need auto-scaling (traffic spikes)
- Need multi-region (disaster recovery)
- Revenue >$5,000 MRR (infrastructure <2% of revenue)

### ElastiCache: Upgrade from cache.t4g.micro → cache.t4g.small
**Triggers:**
- Memory utilization >80%
- Eviction rate >0 (keys being removed due to memory pressure)
- Connection issues
- Cache hit rate <80%

**Next tier:** cache.t4g.small ($23/mo) → cache.m7g.large ($115/mo for production)

### S3: Keep optimizing
**No need to upgrade, just optimize:**
- Enable Intelligent-Tiering for all objects >128 KB
- Set lifecycle policy: Standard (30 days) → Intelligent-Tiering
- Archive old recordings to Glacier after 90 days
- Use S3 Transfer Acceleration only if needed

---

## Cost Monitoring & Alerts

### AWS Budgets (Set these up Week 1!)
- **Alert 1:** $30/mo (75% of $40 budget)
- **Alert 2:** $40/mo (100% of budget)
- **Alert 3:** $50/mo (125% - something's wrong!)

### CloudWatch Alarms (Free tier: 10 alarms)
1. EC2 CPU >80% for 15 minutes
2. RDS connections >80
3. RDS storage >80%
4. ElastiCache memory >80%
5. S3 bucket size (monthly)

### Weekly Cost Review
- Check AWS Cost Explorer every Monday
- Identify any unexpected charges
- Disable unused resources (dev instances, old snapshots)

---

## Phase 2+: Scaling Strategy (Week 13+)

### When Revenue Justifies It ($1,000+ MRR)
- Upgrade EC2 to t3.medium ($30/mo)
- Add CloudFront CDN ($5-10/mo)
- Upgrade RDS to db.t4g.small ($25/mo)

### When Revenue Grows ($5,000+ MRR)
- Add second EC2 instance + Load Balancer
- Upgrade to db.r6g.large ($120/mo) or Aurora Serverless
- Add Redis cluster mode (cache.m7g.large $115/mo)
- Add ClickHouse for analytics

### Enterprise Scale ($25,000+ MRR)
- Multi-AZ deployments
- Aurora PostgreSQL with read replicas
- ElastiCache cluster mode with 3+ nodes
- Multi-region deployment (us-east-1 + us-west-2)

---

## Additional Cost Optimizations

### Use AWS Free Tier (12 months)
**If this is a new AWS account:**
- 750 hours/mo t2.micro or t3.micro EC2 (FREE for 12 months)
- 750 hours/mo RDS db.t2.micro or db.t3.micro (FREE for 12 months)
- 5 GB S3 Standard storage (FREE for 12 months)

**Reality check:** Your workload may exceed free tier quickly (FreeSWITCH needs >1GB RAM), but every bit helps!

### Spot Instances for Workers
- Use Spot Instances for non-critical workers (campaign dialer, analytics jobs)
- 60-90% cheaper than On-Demand
- Auto-failover to On-Demand if Spot interrupted

### Reserved Instances (After 3-6 months)
- Once workload is stable and predictable
- 1-year Reserved Instance = 30-40% savings
- 3-year Reserved Instance = 60% savings (risky for startup)

### Savings Plans (Flexible)
- Compute Savings Plan = 20-30% savings
- More flexible than Reserved Instances
- Good option after 6 months

---

## Cost Estimation Calculator

### Beta Launch (10 customers, 1,000 calls/day)
- EC2 t3.small: $15/mo
- RDS db.t4g.micro: $12/mo
- ElastiCache cache.t4g.micro: $11/mo
- S3 (500 GB recordings): $12/mo
- Data transfer: $5/mo
- **Total: ~$55/mo**

### Early Growth (50 customers, 5,000 calls/day)
- EC2 t3.medium: $30/mo
- RDS db.t4g.small: $25/mo
- ElastiCache cache.t4g.small: $23/mo
- S3 (2 TB recordings): $48/mo
- CloudFront CDN: $10/mo
- Data transfer: $20/mo
- **Total: ~$156/mo**

### Scale (500 customers, 50,000 calls/day)
- EC2 t3.xlarge × 2 + ALB: $250/mo
- RDS db.r6g.large: $120/mo
- ElastiCache cluster: $115/mo
- S3 (10 TB): $240/mo
- CloudFront: $50/mo
- Data transfer: $100/mo
- **Total: ~$875/mo**

**Revenue at scale:** $25,000+ MRR → Infrastructure = 3.5% of revenue ✅

---

## Key Principles

1. **Start with t4g (ARM) instances** - Cheapest AWS option, great performance
2. **No CloudFront until needed** - S3 direct access is fine for <100 users
3. **Single AZ initially** - Multi-AZ adds 100% cost, add later
4. **No read replicas initially** - Add when read load justifies it
5. **Lifecycle policies on S3** - Automatically move old data to cheaper tiers
6. **Monitor weekly** - Catch cost overruns early
7. **Scale UP with revenue** - Never scale ahead of revenue

---

## Emergency Cost Reduction (If Budget Exceeded)

**If costs spike unexpectedly:**
1. Stop all non-production EC2 instances
2. Delete old RDS snapshots (keep last 2 only)
3. Check S3 for unexpected uploads (bot attacks?)
4. Review CloudWatch Logs retention (set to 7 days, not 30)
5. Disable AWS Config, CloudTrail if not needed yet
6. Review NAT Gateway usage (consider NAT instance instead - $15/mo vs $32/mo)

---

## Summary

**Starting lean:**
- **$40/mo** infrastructure (vs $70/mo in original plan)
- Saves $30/mo × 12 months = **$360/year**
- Can handle 10-50 customers easily
- Clear triggers for when to scale up

**Philosophy:** Spend on infrastructure ONLY when revenue justifies it. Every dollar saved in Phase 0-1 extends runway and gives more time to find product-market fit.

---

**Next Steps:**
1. Set up AWS Budgets ($30, $40, $50 alerts)
2. Use t3.small + db.t4g.micro + cache.t4g.micro
3. Skip CloudFront initially
4. Monitor costs weekly
5. Scale UP when metrics justify it

**Let's build lean! 🚀**
