# IRISX Documentation

Organized technical documentation for the IRISX platform.

---

## Documentation Structure

### 📁 `/infrastructure`
AWS infrastructure, networking, EC2 instances, and cost strategies.

- [AWS_COST_STRATEGY.md](./infrastructure/AWS_COST_STRATEGY.md) - Cost optimization decisions
- [AWS_INFRASTRUCTURE_SUMMARY.md](./infrastructure/AWS_INFRASTRUCTURE_SUMMARY.md) - Complete AWS setup
- [AWS_NAMING_CONVENTIONS.md](./infrastructure/AWS_NAMING_CONVENTIONS.md) - Resource naming standards
- [EC2_INSTANCES_SUMMARY.md](./infrastructure/EC2_INSTANCES_SUMMARY.md) - EC2 details and SSH access
- [PHASE_0_WEEK_1_COMPLETE.md](./infrastructure/PHASE_0_WEEK_1_COMPLETE.md) - Week 1 completion summary

### 📁 `/database`
Database schema, migrations, and strategy documentation.

- [DATABASE_SCHEMA.md](./database/DATABASE_SCHEMA.md) - Complete PostgreSQL schema (10 tables)
- [DATABASE_STRATEGY.md](./database/DATABASE_STRATEGY.md) - RDS vs Aurora decision
- [DATABASE_MIGRATION_NOTES.md](./database/DATABASE_MIGRATION_NOTES.md) - Migration process

### 📁 `/security`
Security architecture, hardening, and compliance documentation.

- [SECURITY_ARCHITECTURE.md](./security/SECURITY_ARCHITECTURE.md) - Complete security plan
- [SECURITY_UPDATE_PHASE1.md](./security/SECURITY_UPDATE_PHASE1.md) - Phase 1 security hardening

### 📁 `/api`
API server setup, endpoints, and authentication documentation.

- [API_SETUP_COMPLETE.md](./api/API_SETUP_COMPLETE.md) - Hono.js API setup and endpoints

---

## Quick Links

**Infrastructure:**
- AWS Resource IDs: [../aws-infrastructure-ids.txt](../aws-infrastructure-ids.txt)
- API Server IP: `3.83.53.69`
- FreeSWITCH Server IP: `54.160.220.243`

**Database:**
- PostgreSQL Endpoint: `irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com:5432`
- Redis Endpoint: `irisx-prod-redis.zjxfxn.0001.use1.cache.amazonaws.com:6379`
- Migrations: [../database/migrations/](../database/migrations/)

**Security:**
- Your SSH IP: `73.6.78.238/32`
- API Security Group: `sg-03f77311c140b8f2e`
- FreeSWITCH Security Group: `sg-0460ce5af3265896a`

**API:**
- Health Check: `http://3.83.53.69:3000/health` (internal only)
- PM2 Process: `irisx-api`
- Working Directory: `/home/ubuntu/irisx-backend`

---

## Documentation Philosophy

**Keep Root Clean:**
- Only `README.md` and `SESSION_RECOVERY.md` in project root
- All technical docs organized under `/docs` by category
- Planning docs stay in `/project_bible`

**Organization Rules:**
1. Infrastructure docs → `/docs/infrastructure`
2. Database docs → `/docs/database`
3. Security docs → `/docs/security`
4. API docs → `/docs/api`
5. Planning docs → `/project_bible` (existing)

---

## Current Status

**Phase 0, Week 2 - Backend API Development (50% Complete)**

✅ Complete:
- AWS infrastructure deployed
- Database schema created (10 tables)
- API server running (Hono.js + PM2)
- Security hardening Phase 1

⏳ In Progress:
- API endpoint development
- Authentication middleware
- nginx reverse proxy

📋 Next:
- Install nginx
- Implement API key authentication
- Build first endpoint: `POST /v1/calls`

---

## How to Use This Documentation

### For New Sessions
1. Read [../SESSION_RECOVERY.md](../SESSION_RECOVERY.md) for context
2. Check [./infrastructure/PHASE_0_WEEK_1_COMPLETE.md](./infrastructure/PHASE_0_WEEK_1_COMPLETE.md) for what's done
3. Read relevant category docs for your task

### For Infrastructure Work
Start with [./infrastructure/](./infrastructure/)

### For Database Work
Start with [./database/DATABASE_SCHEMA.md](./database/DATABASE_SCHEMA.md)

### For Security Work
Start with [./security/SECURITY_ARCHITECTURE.md](./security/SECURITY_ARCHITECTURE.md)

### For API Work
Start with [./api/API_SETUP_COMPLETE.md](./api/API_SETUP_COMPLETE.md)

---

## Contributing

When creating new documentation:

1. **Determine category:** infrastructure, database, security, or api
2. **Create in appropriate folder:** `/docs/{category}/YOUR_DOC.md`
3. **Update this README:** Add link to new doc
4. **Use descriptive names:** `FEATURE_DESCRIPTION.md` (all caps)
5. **Add to git:** `git add docs/{category}/YOUR_DOC.md`

---

## Documentation Standards

- Use GitHub-flavored Markdown
- Include table of contents for long docs (>500 lines)
- Add `---` section dividers
- Use code blocks with language syntax highlighting
- Include "Quick Commands" section where applicable
- Add "Cost Impact" section for infrastructure changes
- Include "Security Notes" where relevant

---

Last Updated: October 28, 2025
