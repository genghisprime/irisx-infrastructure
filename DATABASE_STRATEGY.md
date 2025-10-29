# IRISX Database Strategy: RDS PostgreSQL vs Aurora

## Current Setup: RDS PostgreSQL db.t4g.micro

**What we deployed:** Standard RDS PostgreSQL 16.6 on db.t4g.micro

---

## The Question: Why Not Aurora?

Great question! Here's the detailed comparison:

### Cost Comparison

| Database Type | Configuration | Monthly Cost | When to Use |
|--------------|---------------|--------------|-------------|
| **RDS PostgreSQL db.t4g.micro** | 2 vCPU, 1 GB RAM, 20 GB | **$12/mo** | Development, beta, early customers (<100) |
| **RDS PostgreSQL db.t4g.small** | 2 vCPU, 2 GB RAM | $25/mo | Growing (100-500 customers) |
| **RDS PostgreSQL db.t4g.medium** | 2 vCPU, 4 GB RAM | $50/mo | Established (500-2000 customers) |
| **Aurora Serverless v2** | 0.5-1 ACU minimum | $45-90/mo | Variable traffic, need auto-scaling |
| **Aurora Provisioned** | 2 ACU (1 vCPU, 2 GB) | $90/mo | Need read replicas, multi-region |

**Winner for startup:** RDS PostgreSQL db.t4g.micro = **$12/mo** (saves $33-78/mo vs Aurora)

---

## Detailed Comparison

### RDS PostgreSQL Standard (What We're Using)

#### Pros ✅
1. **Cheapest option** - $12/mo for db.t4g.micro (ARM-based)
2. **Predictable costs** - No surprise ACU scaling charges
3. **Sufficient for startup** - Handles 100+ concurrent connections, 1,000+ calls/day
4. **Standard PostgreSQL** - 100% compatible, no vendor lock-in
5. **Easy to understand** - Traditional database, familiar tooling
6. **t4g (ARM) instances** - 20% cheaper than x86 (t3)
7. **GP3 storage** - Better performance/$ than GP2

#### Cons ❌
1. **Manual scaling** - Need to resize instance if outgrow it
2. **Single instance** - No automatic failover (unless multi-AZ, which costs 2x)
3. **Fixed capacity** - Can't auto-scale during traffic spikes
4. **No read replicas** - Can't horizontally scale reads easily

#### Best For
- **Phase 0-2** (Weeks 1-18) - Development, beta, early customers
- **Revenue:** $0-$5,000 MRR
- **Load:** <1,000 concurrent connections, <10,000 calls/day

---

### Aurora PostgreSQL

#### Pros ✅
1. **Auto-scaling** - Scales from 0.5 ACU to 128 ACU automatically
2. **High availability** - Automatic failover in <30 seconds
3. **Read replicas** - Up to 15 read replicas, auto-scaling
4. **Better performance** - 3x faster than standard PostgreSQL (AWS claims)
5. **Multi-region** - Easy to replicate across regions
6. **Serverless v2** - Pay only for what you use (in theory)
7. **Storage auto-grows** - No manual storage management

#### Cons ❌
1. **Expensive** - Minimum $45/mo for Serverless v2 (0.5 ACU × 730 hrs)
2. **Complex pricing** - ACU-based, can spike unexpectedly
3. **Vendor lock-in** - Aurora-specific features, harder to migrate off AWS
4. **Overkill for small apps** - Built for enterprise scale
5. **Cold start delays** - Serverless can pause/resume (latency spikes)

#### Best For
- **Phase 3+** (Week 19+) - Production scale, enterprise customers
- **Revenue:** $5,000+ MRR (can afford $90/mo database)
- **Load:** >10,000 concurrent connections, >50,000 calls/day
- **Need:** Read replicas, multi-region, auto-scaling

---

## Our Migration Path

### Phase 0-1: RDS PostgreSQL db.t4g.micro ($12/mo)
**Weeks 1-12 - Development & Beta**
- 10-50 customers
- 1,000-5,000 calls/day
- Single instance, single AZ
- Manual backups + 7-day retention

**Upgrade trigger:** Database connections >80 OR CPU >70% OR slow queries

---

### Phase 2: RDS PostgreSQL db.t4g.small ($25/mo)
**Weeks 13-18 - Growing User Base**
- 50-200 customers
- 5,000-20,000 calls/day
- Still single instance
- Consider multi-AZ ($50/mo) if revenue allows

**Upgrade trigger:** CPU >70% OR need more RAM

---

### Phase 3: RDS PostgreSQL db.t4g.medium ($50/mo)
**Weeks 19-26 - Established Product**
- 200-1,000 customers
- 20,000-50,000 calls/day
- Multi-AZ recommended ($100/mo)
- Add read replica if needed ($50/mo extra)

**Upgrade trigger:** Need read replicas OR auto-scaling OR multi-region

---

### Phase 4+: Migrate to Aurora PostgreSQL ($90-200/mo)
**Weeks 27+ - Enterprise Scale**
- 1,000+ customers
- 50,000+ calls/day
- Revenue >$5,000 MRR
- Infrastructure cost <2% of revenue

**Migration process:**
1. Create Aurora cluster from RDS snapshot (zero downtime)
2. Test thoroughly
3. Switch DNS/connection string
4. Monitor performance
5. Decommission old RDS instance

---

## Cost Over Time (Example)

| Phase | Timeframe | Customers | Database | Monthly Cost | Revenue | DB % |
|-------|-----------|-----------|----------|--------------|---------|------|
| Beta | Weeks 1-12 | 10-50 | db.t4g.micro | $12 | $500 | 2.4% |
| Growth | Weeks 13-18 | 50-200 | db.t4g.small | $25 | $2,000 | 1.3% |
| Scale | Weeks 19-26 | 200-1K | db.t4g.medium (multi-AZ) | $100 | $10,000 | 1.0% |
| Enterprise | Week 27+ | 1K-10K | Aurora (2 ACU) | $200 | $50,000 | 0.4% |

**Key insight:** Database costs DECREASE as % of revenue as you scale! Start cheap, upgrade when revenue justifies it.

---

## Why db.t4g.micro is Perfect for Now

### It Handles More Than You Think
- **Connections:** 100+ concurrent connections (plenty for beta)
- **Throughput:** 1,000+ queries/second (way more than needed)
- **Storage:** 20 GB (can store ~500K call records + CDR)
- **IOPS:** 3,000 IOPS (GP3) - fast enough for transactional workload

### Real-World Example
**Scenario:** 100 beta customers, 5,000 calls/day
- **Database load:**
  - 5,000 calls/day = ~200 calls/hour = ~3.5 calls/minute
  - Each call = ~10 queries (create call, update status, insert CDR, etc.)
  - Total: ~35 queries/minute = **0.6 queries/second**
  - db.t4g.micro can handle **1,000+ queries/second**

**Result:** You're using <0.1% of database capacity! 🎉

---

## When to Actually Upgrade

### From db.t4g.micro → db.t4g.small ($12 → $25/mo)
**Triggers:**
- Database connections consistently >80
- CPU >70% for >1 hour
- Query latency >100ms p95
- Running out of RAM (check `pg_stat_activity`)

**Realistic timing:** ~500-1,000 customers OR 20,000+ calls/day

---

### From RDS PostgreSQL → Aurora ($50 → $90/mo)
**Triggers:**
- Need read replicas (analytics queries slowing down app)
- Need multi-region (disaster recovery, global presence)
- Need auto-scaling (huge traffic spikes, unpredictable load)
- Revenue >$5,000 MRR (can afford premium database)

**Realistic timing:** 2,000+ customers OR $10,000+ MRR

---

## Aurora Myths Debunked

### Myth 1: "Aurora is 3x faster"
**Reality:** Only true for specific workloads (heavy writes, complex joins). For OLTP (what IRISX does), RDS PostgreSQL is nearly identical performance-wise.

### Myth 2: "Aurora Serverless saves money"
**Reality:** Serverless v2 minimum is 0.5 ACU × 730 hrs/mo = $45/mo. That's 4x more expensive than db.t4g.micro! Only saves money if you scale to zero (bad for production app).

### Myth 3: "You need Aurora to scale"
**Reality:** RDS PostgreSQL can handle 10,000+ concurrent connections and millions of queries/day. Most apps never need Aurora.

---

## The Bottom Line

### Start with RDS PostgreSQL db.t4g.micro because:
1. ✅ **Saves $33-78/mo** vs Aurora (extends runway by months!)
2. ✅ **More than enough capacity** for beta + early customers
3. ✅ **Predictable costs** - no surprise ACU scaling bills
4. ✅ **Easy to migrate to Aurora later** - one-click snapshot restore
5. ✅ **Standard PostgreSQL** - no vendor lock-in

### Upgrade to Aurora when:
1. 💰 **Revenue justifies it** - $5,000+ MRR
2. 📊 **You need read replicas** - analytics slowing down app
3. 🌍 **You need multi-region** - global customers, disaster recovery
4. 📈 **You need auto-scaling** - unpredictable traffic spikes

---

## Migration from RDS to Aurora (Future)

When you're ready to migrate, it's easy:

```bash
# 1. Create Aurora cluster from RDS snapshot
aws rds restore-db-cluster-to-point-in-time \
  --source-db-instance-identifier irisx-prod-rds-postgres \
  --db-cluster-identifier irisx-prod-aurora \
  --restore-type copy-on-write \
  --engine aurora-postgresql

# 2. Test connection to Aurora cluster
# 3. Update application connection string
# 4. Monitor performance for 24 hours
# 5. Delete old RDS instance once satisfied
```

**Downtime:** <5 minutes (just DNS update)

---

## Summary: Decision Matrix

| Situation | Recommendation | Cost |
|-----------|---------------|------|
| **Development & Beta** (now) | RDS db.t4g.micro | $12/mo |
| **100-500 customers** | RDS db.t4g.small | $25/mo |
| **500-2,000 customers** | RDS db.t4g.medium + Multi-AZ | $100/mo |
| **2,000+ customers, $10K+ MRR** | Aurora Serverless v2 or Provisioned | $90-200/mo |
| **Enterprise, multi-region** | Aurora Global Database | $200-500/mo |

**Current choice: RDS PostgreSQL db.t4g.micro** ✅

**Next upgrade:** When you hit 500+ customers or $5,000+ MRR (Phase 3, Week 19+)

---

## Action Items

- [x] Deploy RDS PostgreSQL db.t4g.micro ($12/mo)
- [ ] Set up CloudWatch alarm: Connections >80
- [ ] Set up CloudWatch alarm: CPU >70%
- [ ] Set up CloudWatch alarm: Storage >80%
- [ ] Monitor weekly in Phase 0-1
- [ ] Revisit database sizing at Phase 2 (Week 13)
- [ ] Consider Aurora migration at $5,000 MRR

**We chose wisely! Save that $33/mo for marketing! 🚀**
