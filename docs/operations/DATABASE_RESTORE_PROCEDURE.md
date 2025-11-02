# Database Restore Procedure

## Overview
This document outlines the procedures for restoring the IRISX production database from automated backups or manual snapshots.

## Backup Configuration

### Automated Backups
- **Retention Period**: 7 days
- **Backup Window**: 03:00-04:00 UTC (11 PM - 12 AM EST)
- **Point-in-Time Recovery**: Enabled (up to the last 5 minutes)
- **RDS Instance**: `irisx-prod-rds-postgres`

### Manual Snapshots
Manual snapshots can be created at any time and are retained indefinitely until explicitly deleted.

## Restore Scenarios

### Scenario 1: Restore from Automated Backup (Point-in-Time Recovery)

**Use Case**: Restore database to a specific point in time within the last 7 days

```bash
# 1. Check latest restorable time
aws rds describe-db-instances \
  --db-instance-identifier irisx-prod-rds-postgres \
  --query 'DBInstances[0].LatestRestorableTime'

# 2. Restore to a new DB instance (recommended - test before cutover)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier irisx-prod-rds-postgres \
  --target-db-instance-identifier irisx-prod-rds-restored \
  --restore-time "2025-11-02T12:00:00Z" \
  --db-subnet-group-name default-vpc-xxxxxx \
  --vpc-security-group-ids sg-xxxxxx

# 3. Wait for restore to complete (10-30 minutes typically)
aws rds describe-db-instances \
  --db-instance-identifier irisx-prod-rds-restored \
  --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address]'

# 4. Test the restored database
psql -h <restored-endpoint> -U postgres -d irisx -c "SELECT COUNT(*) FROM tenants;"

# 5. Update application to use restored database (if validation passes)
# Update .env file on API server:
# DB_HOST=<restored-endpoint>
# Then restart: pm2 restart irisx-api
```

### Scenario 2: Restore from Manual Snapshot

**Use Case**: Restore from a known good state captured via manual snapshot

```bash
# 1. List available snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier irisx-prod-rds-postgres \
  --query 'DBSnapshots[].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table

# 2. Restore from specific snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier irisx-prod-rds-restored \
  --db-snapshot-identifier rds:irisx-prod-rds-postgres-2025-10-31-03-07 \
  --db-subnet-group-name default-vpc-xxxxxx \
  --vpc-security-group-ids sg-xxxxxx

# 3. Follow steps 3-5 from Scenario 1 above
```

### Scenario 3: In-Place Restore (Emergency Only)

**WARNING**: This approach involves downtime and risk. Only use in true emergencies.

```bash
# 1. Create final snapshot before restore
aws rds create-db-snapshot \
  --db-instance-identifier irisx-prod-rds-postgres \
  --db-snapshot-identifier irisx-pre-restore-$(date +%Y%m%d-%H%M%S)

# 2. Delete the current production instance
aws rds delete-db-instance \
  --db-instance-identifier irisx-prod-rds-postgres \
  --skip-final-snapshot

# 3. Restore with the original instance name
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier irisx-prod-rds-postgres \
  --db-snapshot-identifier <snapshot-id> \
  --db-subnet-group-name default-vpc-xxxxxx \
  --vpc-security-group-ids sg-xxxxxx

# 4. Wait for availability and restart application
aws rds wait db-instance-available \
  --db-instance-identifier irisx-prod-rds-postgres

ssh ubuntu@3.83.53.69 "cd /home/ubuntu/irisx-backend && pm2 restart irisx-api"
```

## Creating Manual Snapshots

### Before Major Changes
Always create a manual snapshot before:
- Schema migrations
- Bulk data operations
- Application upgrades
- Configuration changes

```bash
# Create snapshot with descriptive name
aws rds create-db-snapshot \
  --db-instance-identifier irisx-prod-rds-postgres \
  --db-snapshot-identifier irisx-pre-migration-$(date +%Y%m%d-%H%M%S)

# Monitor snapshot creation
aws rds describe-db-snapshots \
  --db-snapshot-identifier <snapshot-id> \
  --query 'DBSnapshots[0].[Status,PercentProgress]'
```

## Validation Steps

After any restore operation, validate:

1. **Database Connectivity**
```bash
psql -h <endpoint> -U postgres -d irisx -c "SELECT version();"
```

2. **Data Integrity**
```bash
# Check row counts
psql -h <endpoint> -U postgres -d irisx -c "
  SELECT 'tenants' as table_name, COUNT(*) FROM tenants
  UNION ALL
  SELECT 'users', COUNT(*) FROM users
  UNION ALL
  SELECT 'calls', COUNT(*) FROM calls
  UNION ALL
  SELECT 'api_keys', COUNT(*) FROM api_keys;
"
```

3. **Application Health**
```bash
curl http://3.83.53.69:3000/health | jq '.database'
```

4. **Recent Data Check**
```bash
# Verify latest records match expected restore point
psql -h <endpoint> -U postgres -d irisx -c "
  SELECT MAX(created_at) as latest_call FROM calls;
  SELECT MAX(created_at) as latest_user FROM users;
"
```

## Recovery Time Objectives (RTO)

- **Point-in-Time Restore**: 15-30 minutes (includes validation)
- **Snapshot Restore**: 10-20 minutes (includes validation)
- **In-Place Restore**: 20-40 minutes (includes deletion wait time)

## Recovery Point Objectives (RPO)

- **Automated Backups**: Up to 5 minutes (point-in-time recovery)
- **Manual Snapshots**: Depends on snapshot frequency (recommend before major changes)

## Rollback Procedure

If a restore operation fails or produces unexpected results:

1. **Stop Application Traffic**
```bash
ssh ubuntu@3.83.53.69 "cd /home/ubuntu/irisx-backend && pm2 stop irisx-api"
```

2. **Delete Failed Restore Instance** (if using new instance approach)
```bash
aws rds delete-db-instance \
  --db-instance-identifier irisx-prod-rds-restored \
  --skip-final-snapshot
```

3. **Revert Application Configuration**
```bash
# Update .env back to original endpoint
ssh ubuntu@3.83.53.69 "cd /home/ubuntu/irisx-backend && \
  sed -i 's/DB_HOST=.*/DB_HOST=<original-endpoint>/' .env && \
  pm2 restart irisx-api"
```

4. **Validate Original Database**
```bash
curl http://3.83.53.69:3000/health | jq '.database'
```

## Tested Restore

**Last Test Date**: 2025-11-02
**Test Snapshot**: `irisx-restore-test-20251102-172144`
**Result**: Snapshot creation successful, restore procedure documented
**Next Test Due**: 2025-12-02 (monthly testing recommended)

## Emergency Contacts

For restore operations during incidents:
1. Check `docs/operations/RUNBOOK.md` for incident response procedures
2. Verify backup availability before making destructive changes
3. Document all actions in incident log
4. Test restored instance before cutover

## S3 Recordings Backup

Recordings stored in S3 have additional protection:
- **Versioning**: Enabled on both buckets
  - `irisx-prod-recordings-672e7c49`
  - `irisx-recordings`
- **Version Retention**: 30 days (automated cleanup via lifecycle policy)
- **Recovery**: Versions can be restored via AWS Console or CLI

```bash
# List object versions
aws s3api list-object-versions \
  --bucket irisx-prod-recordings-672e7c49 \
  --prefix recordings/

# Restore specific version
aws s3api get-object \
  --bucket irisx-prod-recordings-672e7c49 \
  --key recordings/call-12345.wav \
  --version-id <version-id> \
  restored-file.wav
```

## Notes

- Always prefer restoring to a new instance first (non-destructive)
- Test database connectivity before changing application config
- Keep production database endpoint stable; only change in emergencies
- Document every restore operation in the incident log
- Update monitoring after restore operations to ensure alerting works
