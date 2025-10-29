# IRISX Platform - Scaling Roadmap & Capacity Planning

**Last Updated:** October 29, 2025
**Current Status:** Production-Scale Configuration (Day 1 Ready for 1000+ companies)

---

## 🎯 Current Capacity (As Deployed)

### NATS JetStream Message Queue
- **Total Storage:** 100GB (10x increase from initial 10GB)
- **Memory:** 4GB
- **Max Message Size:** 100MB (supports large email attachments)
- **Connection Capacity:** 10,000 concurrent connections
- **Stream Allocation:**
  - SMS: 30GB (handles 60M messages at ~500 bytes each)
  - EMAIL: 40GB (handles 8M emails at ~5KB each)
  - WEBHOOKS: 20GB (handles 10M webhooks at ~2KB each)

### Message Retention
- **Retention Period:** 7 days for all streams
- **Discard Policy:** Automatic (oldest messages removed when limits hit)
- **Max Messages per Stream:** 10 million

### Supported Load (Conservative Estimates)
| Metric | Capacity | Notes |
|--------|----------|-------|
| **Companies** | 1000-2000 | Current configuration |
| **Daily SMS** | 500K-1M | With 7-day retention |
| **Daily Emails** | 1M-2M | With 7-day retention |
| **Daily Webhooks** | 2M-5M | With 7-day retention |
| **Concurrent API Requests** | 10K+ | Load balancer ready |

---

## 📊 When to Scale Next

### Trigger Points for Next Scaling Event

#### ⚠️ **Yellow Alert** (Plan Scaling)
Monitor these thresholds in admin dashboard:

| Component | Threshold | Action Required |
|-----------|-----------|-----------------|
| **NATS Storage** | >70% used (70GB) | Plan upgrade to 250GB within 2 weeks |
| **Queue Depth** | >50,000 msgs | Add more worker instances |
| **Worker CPU** | >70% avg | Scale workers horizontally |
| **Companies** | >1,500 | Review all infrastructure |
| **API Response Time** | >200ms p95 | Add API instances or optimize |

#### 🚨 **Red Alert** (Scale Immediately)
| Component | Threshold | Immediate Action |
|-----------|-----------|------------------|
| **NATS Storage** | >85% used (85GB) | Emergency upgrade to 250GB |
| **Queue Depth** | >100,000 msgs | Double worker count NOW |
| **Worker Errors** | >5% failure rate | Investigate + scale |
| **Companies** | >2,000 | Execute Phase 2 scaling |

---

## 🚀 Scaling Phases

### **Phase 1: CURRENT (0-2,000 companies)**
✅ **Status:** DEPLOYED
**Capacity:**
- NATS: 100GB storage, 4GB memory
- Workers: 1x each (SMS, Email, Webhook)
- API Servers: 1x instance
- Database: Single RDS instance

**Expected Duration:** 6-12 months

---

### **Phase 2: Growth (2,000-10,000 companies)**
**When to Deploy:** When companies >1,500 OR storage >70GB

**Infrastructure Changes:**
```
NATS Upgrade:
- Storage: 100GB → 250GB
- Memory: 4GB → 8GB
- Stream limits:
  - SMS: 30GB → 75GB
  - EMAIL: 40GB → 125GB
  - WEBHOOKS: 20GB → 50GB

Worker Scaling:
- SMS workers: 1 → 3-5 instances
- Email workers: 1 → 3-5 instances
- Webhook workers: 1 → 3-5 instances
- Use PM2 cluster mode or Kubernetes

API Scaling:
- API instances: 1 → 3-5 behind ALB
- Add Application Load Balancer
- Implement auto-scaling (target 70% CPU)

Database:
- Enable read replicas (2-3 replicas)
- Consider database sharding by tenant
```

**Cost Impact:** ~$400-600/month (from ~$92/month)

**Expected Duration:** 12-24 months

---

### **Phase 3: Enterprise (10,000-50,000 companies)**
**When to Deploy:** When companies >8,000 OR sustained >5M daily messages

**Infrastructure Changes:**
```
NATS Clustering:
- Deploy 3-node NATS cluster for HA
- Storage per node: 250GB
- Cross-region replication
- Consider NATS Supercluster

Worker Fleet:
- 10-20 workers per queue type
- Kubernetes with HPA (Horizontal Pod Autoscaling)
- Regional worker distribution

API Layer:
- 10-20 API instances across regions
- CloudFront CDN
- API Gateway with rate limiting
- Multi-region active-active

Database:
- Multi-region RDS with Aurora Global Database
- Tenant sharding (10K tenants per shard)
- Redis cluster for caching
```

**Cost Impact:** ~$3,000-5,000/month

**Expected Duration:** 24-36 months

---

### **Phase 4: Hyper-Scale (50,000+ companies)**
**When to Deploy:** When companies >40,000

**Infrastructure Changes:**
```
- NATS Supercluster (multi-region, multi-cloud)
- Kubernetes across 3+ regions
- Database: Custom sharding strategy, 100K+ tenants per region
- Message queue: Consider Kafka for analytics pipeline
- Microservices architecture (split monolith)
- Dedicated infrastructure for top 1% of customers
```

**Cost Impact:** ~$15,000-30,000/month

---

## 📈 Monitoring & Alerts (Admin Dashboard Integration)

### Critical Metrics to Monitor

#### NATS Health
```javascript
// Monitor via NATS HTTP API: http://localhost:8222/jsz
{
  "storage_used_percent": "Calculate from bytes / max_file_store",
  "stream_messages_total": "Sum across all streams",
  "consumer_pending": "Messages waiting in queues",
  "consumer_ack_floor": "Processing lag indicator"
}
```

#### Alert Thresholds (Add to Admin Dashboard)
| Metric | Warning | Critical | Resolution |
|--------|---------|----------|------------|
| Storage Used % | 70% | 85% | Upgrade NATS storage |
| Queue Depth | 50K | 100K | Add workers |
| Consumer Lag | >1 min | >5 min | Scale workers |
| Message Delivery Failures | >2% | >5% | Check integrations |
| Worker Restart Count | >10/hour | >20/hour | Fix worker code |

#### Worker Performance
```javascript
{
  "messages_per_second": "Target: 100+ per worker",
  "average_processing_time": "Target: <1 second",
  "error_rate": "Target: <1%",
  "retry_rate": "Target: <5%"
}
```

---

## 💰 Cost Projections

### Current (Phase 1)
```
Monthly Costs:
- EC2 (2x t3.medium): $60
- RDS PostgreSQL: $15
- ElastiCache Redis: $12
- S3 + Transfer: $5
Total Infrastructure: ~$92/month

Variable Costs (per 1M operations):
- Twilio SMS: $7,900 (at $0.0079/msg)
- Twilio Voice: $13,000/1M minutes
- Elastic Email: $90/1M emails
- OpenAI TTS: $15/1M chars
```

### Growth (Phase 2 - 2K-10K companies)
```
Monthly Infrastructure: ~$500/month
- ALB: $20
- EC2 (5x t3.large): $300
- RDS (with replicas): $80
- ElastiCache: $50
- S3 + CloudFront: $50
```

### Enterprise (Phase 3 - 10K-50K companies)
```
Monthly Infrastructure: ~$4,000/month
- Multi-region deployment
- Kubernetes cluster
- Aurora Global Database
- Advanced monitoring (DataDog/New Relic)
```

---

## 🔧 Operational Readiness Checklist

### Before Phase 2 Scaling
- [ ] Implement comprehensive monitoring dashboard
- [ ] Set up PagerDuty/OnCall rotations
- [ ] Document runbooks for common issues
- [ ] Load test to 3x current capacity
- [ ] Implement database backup automation
- [ ] Create disaster recovery plan
- [ ] Implement blue-green deployments
- [ ] Add chaos engineering tests

### Before Phase 3 Scaling
- [ ] Migrate to microservices architecture
- [ ] Implement API versioning strategy
- [ ] Multi-region deployment tested
- [ ] SOC 2 compliance achieved
- [ ] 24/7 support team in place
- [ ] Advanced security audit completed

---

## 📞 Monitoring Dashboard Integration

### Admin Dashboard Metrics to Add

#### Real-Time Queue Health Widget
```
NATS Message Queue Status:
├── Storage: 45GB / 100GB (45%) [Green]
├── Messages in Queue: 1,247 [Green]
├── Processing Rate: 1,340 msg/sec [Green]
└── Workers: 3/3 online [Green]

Stream Breakdown:
├── SMS: 234 pending | 450/sec processed
├── Email: 890 pending | 780/sec processed
└── Webhooks: 123 pending | 110/sec processed
```

#### Capacity Planning Widget
```
Time Until Scaling Required:
├── Current Growth Rate: 15 companies/week
├── Current Load: 1,200 companies (60% capacity)
├── Storage Trend: +2GB/week
└── Estimated Scale Date: March 2026 (4 months)
     [Action: Begin Phase 2 planning]
```

#### Cost Tracking Widget
```
Current Month Costs:
├── Infrastructure: $92
├── SMS (Twilio): $1,240 (157K messages)
├── Email (Elastic): $18 (200K emails)
├── Voice (Twilio): $3,450 (265K mins)
├── TTS (OpenAI): $67 (4.5M chars)
└── Total: $4,867
    Avg per Company: $4.06/month
```

---

## 🎯 Success Metrics

| Phase | Companies | Daily Messages | Response Time | Uptime |
|-------|-----------|----------------|---------------|--------|
| **Phase 1** | 0-2,000 | <2M | <100ms p95 | 99.9% |
| **Phase 2** | 2K-10K | 2M-10M | <150ms p95 | 99.95% |
| **Phase 3** | 10K-50K | 10M-50M | <200ms p95 | 99.99% |
| **Phase 4** | 50K+ | 50M+ | <200ms p95 | 99.995% |

---

## 🔄 Review Schedule

- **Weekly:** Review key metrics dashboard
- **Monthly:** Capacity planning review
- **Quarterly:** Full infrastructure audit
- **Annually:** Architecture review + tech debt assessment

---

**Next Review Date:** November 29, 2025
**Owner:** Platform Engineering Team
**Escalation:** CTO for Phase 2+ planning

