# IRISX Database

PostgreSQL 16.6 database for IRISX multi-channel communications platform.

---

## Quick Start

### 1. Get Database Connection Info

```bash
export AWS_PROFILE=irisx-virginia

# Get PostgreSQL endpoint
RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier irisx-prod-rds-postgres \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

echo "Host: $RDS_ENDPOINT"
echo "Port: 5432"
echo "Database: irisx_prod"
echo "Username: irisx_admin"
echo "Password: (see ../.db-password.txt)"
```

### 2. Connect to Database

```bash
# Using psql
psql "postgresql://irisx_admin:$(cat ../.db-password.txt)@$RDS_ENDPOINT:5432/irisx_prod"

# Or set environment variable
export DATABASE_URL="postgresql://irisx_admin:$(cat ../.db-password.txt)@$RDS_ENDPOINT:5432/irisx_prod"
psql $DATABASE_URL
```

### 3. Run Migrations

```bash
# Run migration
psql $DATABASE_URL < migrations/001_create_core_tables.sql

# Verify tables created
psql $DATABASE_URL -c "\dt"
```

### 4. Load Sample Data (Optional)

```bash
# Load sample data for testing
psql $DATABASE_URL < seeds/001_sample_data.sql
```

---

## Database Schema

See [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) for complete schema documentation.

### Core Tables (Phase 0-1)

1. **tenants** - Organizations/customers (multi-tenancy)
2. **users** - Login accounts (owners, admins, agents)
3. **api_keys** - Programmatic API access
4. **phone_numbers** - DID inventory (phone numbers)
5. **calls** - Call records (main table)
6. **call_logs** - CDR events (call detail records)
7. **webhooks** - Customer webhook endpoints
8. **webhook_deliveries** - Webhook delivery audit log
9. **contacts** - Address book
10. **sessions** - User login sessions

---

## Migrations

### Structure

```
database/
├── migrations/
│   └── 001_create_core_tables.sql  ← Run first
├── seeds/
│   └── 001_sample_data.sql         ← Run after migration (optional)
└── README.md                        ← This file
```

### Running Migrations

Migrations are simple SQL files. Run them in order:

```bash
# Migration 001 (core tables)
psql $DATABASE_URL < migrations/001_create_core_tables.sql

# Future migrations
# psql $DATABASE_URL < migrations/002_add_sms_tables.sql
# psql $DATABASE_URL < migrations/003_add_campaign_tables.sql
```

### Creating New Migrations

```bash
# Create new migration file
touch migrations/002_your_migration_name.sql

# Add SQL:
# - CREATE TABLE statements
# - ALTER TABLE statements
# - CREATE INDEX statements
# - INSERT statements for reference data
```

---

## Connection Examples

### Node.js (pg library)

```javascript
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: 'irisx_prod',
  user: 'irisx_admin',
  password: process.env.DB_PASSWORD,
  max: 20, // connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Query example
const result = await pool.query('SELECT * FROM tenants WHERE slug = $1', ['acme']);
console.log(result.rows);
```

### Environment Variables

```bash
# .env file
DB_HOST=irisx-prod-rds-postgres.xxxxx.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=irisx_prod
DB_USER=irisx_admin
DB_PASSWORD=your_password_here
DB_SSL=true

# Or single connection string
DATABASE_URL=postgresql://irisx_admin:password@host:5432/irisx_prod?sslmode=require
```

---

## Backup & Restore

### Manual Backup

```bash
# Dump database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Or compressed
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore from Backup

```bash
# Restore from dump
psql $DATABASE_URL < backup_20251028.sql

# Or from compressed
gunzip -c backup_20251028.sql.gz | psql $DATABASE_URL
```

### Automated Backups

RDS automatically backs up daily (configured to 7-day retention):
- Backup window: 03:00-04:00 UTC
- Retention: 7 days
- Restore from AWS Console or CLI

---

## Performance Tips

### Indexes

All critical columns have indexes:
- `tenant_id` on every table (for multi-tenancy queries)
- `created_at` / `initiated_at` (for time-range queries)
- `status` (for filtering)
- UUIDs and SIDs (for lookups)

### Query Examples

```sql
-- Get tenant's recent calls (uses idx_calls_tenant_initiated)
SELECT * FROM calls
WHERE tenant_id = 1
  AND initiated_at >= NOW() - INTERVAL '7 days'
ORDER BY initiated_at DESC;

-- Get call with logs (uses idx_call_logs_call_id)
SELECT c.*, cl.*
FROM calls c
LEFT JOIN call_logs cl ON cl.call_id = c.id
WHERE c.call_sid = 'CA123456';

-- Active agents for tenant (uses idx_users_tenant_id, idx_users_status)
SELECT * FROM users
WHERE tenant_id = 1
  AND role = 'agent'
  AND status = 'active'
  AND agent_status != 'offline';
```

### Connection Pooling

**IMPORTANT:** Always use connection pooling!

- **Development:** 5-10 connections
- **Production:** 20-100 connections
- **RDS db.t4g.micro max:** ~100 connections

---

## Security

### SSL/TLS

RDS enforces encrypted connections:

```javascript
// Node.js pg with SSL
const pool = new Pool({
  // ... other config
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/path/to/rds-ca-cert.pem')
  }
});
```

### Row-Level Security (Future)

Enable RLS for additional security:

```sql
-- Enable RLS on tenants table
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Create policy: users can only see their own tenant
CREATE POLICY tenant_isolation ON tenants
  FOR ALL
  TO app_user
  USING (id = current_setting('app.current_tenant_id')::bigint);
```

---

## Monitoring

### Key Metrics to Monitor

1. **Connection count**
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```

2. **Active queries**
   ```sql
   SELECT * FROM pg_stat_activity WHERE state = 'active';
   ```

3. **Slow queries**
   ```sql
   SELECT query, calls, mean_exec_time
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```

4. **Database size**
   ```sql
   SELECT pg_size_pretty(pg_database_size('irisx_prod'));
   ```

5. **Table sizes**
   ```sql
   SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass))
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(tablename::regclass) DESC;
   ```

### CloudWatch Metrics

RDS automatically monitors:
- CPU utilization
- Database connections
- Free storage space
- Read/Write IOPS
- Network throughput

Set up alarms for:
- Connections > 80
- CPU > 70%
- Storage > 80%

---

## Troubleshooting

### Can't connect to RDS

```bash
# 1. Check RDS status
aws rds describe-db-instances \
  --db-instance-identifier irisx-prod-rds-postgres \
  --query 'DBInstances[0].DBInstanceStatus'

# 2. Verify security group allows your IP
aws ec2 describe-security-groups \
  --group-ids sg-0ce78464dc882274b

# 3. Test connection
psql "postgresql://irisx_admin:password@endpoint:5432/irisx_prod"
```

### Slow queries

```sql
-- Enable query logging
ALTER DATABASE irisx_prod SET log_min_duration_statement = 1000; -- log queries >1 sec

-- Check slow queries
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Out of connections

```sql
-- See current connections
SELECT count(*), usename, application_name
FROM pg_stat_activity
GROUP BY usename, application_name;

-- Kill idle connections (if needed)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '10 minutes';
```

---

## Next Steps

1. ✅ Run migration 001
2. ✅ Verify all tables created (`\dt`)
3. ✅ Load sample data (optional)
4. ⏳ Connect from backend API
5. ⏳ Create database module in Node.js app
6. ⏳ Write first API endpoint that queries database

**Database ready to use! 🚀**
