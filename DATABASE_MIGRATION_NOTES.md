# Database Migration Notes

## ✅ Database Status

- **RDS Instance:** Available and ready
- **Endpoint:** `irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com:5432`
- **Database:** `irisx_prod`
- **Username:** `irisx_admin`
- **Password:** See `.db-password.txt`

## 🔒 Security Note

The database is in a **private subnet** and the security group (`irisx-prod-sg-database`) only allows connections from the API security group (`irisx-prod-sg-api`).

This is **GOOD for security** - the database is not publicly accessible!

## 🚀 How to Run Migrations

### Option 1: From EC2 Instance (Recommended)

Once the EC2 API server is launched, run migrations from there:

```bash
# SSH to EC2 instance
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@<ec2-ip>

# Clone this repo or upload migration files
git clone https://github.com/genghisprime/irisx-infrastructure.git
cd irisx-infrastructure/database

# Test connection
./test-connection.sh <password>

# Run migration
export PGPASSWORD="<password>"
psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin \
  -d irisx_prod \
  < migrations/001_create_core_tables.sql

# Verify tables created
psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin \
  -d irisx_prod \
  -c "\dt"

# (Optional) Load sample data
psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin \
  -d irisx_prod \
  < seeds/001_sample_data.sql
```

### Option 2: Temporarily Allow Your IP (Not Recommended)

```bash
# Get your public IP
MY_IP=$(curl -s https://api.ipify.org)

# Add your IP to database security group
aws ec2 authorize-security-group-ingress \
  --group-id sg-0ce78464dc882274b \
  --protocol tcp \
  --port 5432 \
  --cidr $MY_IP/32

# Run migrations from your local machine
export PGPASSWORD="$(cat .db-password.txt)"
psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin \
  -d irisx_prod \
  < database/migrations/001_create_core_tables.sql

# IMPORTANT: Remove your IP from security group after!
aws ec2 revoke-security-group-ingress \
  --group-id sg-0ce78464dc882274b \
  --protocol tcp \
  --port 5432 \
  --cidr $MY_IP/32
```

## 📋 Migration Checklist

- [x] Database instance created
- [x] Schema designed
- [x] Migration files created
- [x] Sample data prepared
- [ ] EC2 instance launched (needed to access database)
- [ ] Migrations run from EC2
- [ ] Tables verified
- [ ] Sample data loaded (optional)
- [ ] Backend API connects successfully

## 🔄 Next Steps

1. Launch EC2 API Server
2. SSH to EC2 instance
3. Install PostgreSQL client (`sudo apt-get install postgresql-client`)
4. Run migrations from EC2
5. Verify tables created
6. Connect backend API to database

**Migrations ready to run once EC2 is launched! 🚀**
