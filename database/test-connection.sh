#!/bin/bash

# IRISX Database Connection Test
# Run this from EC2 instance to test RDS connection

set -e

echo "========================================="
echo "  IRISX Database Connection Test"
echo "========================================="
echo ""

# Configuration
DB_HOST="irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com"
DB_PORT="5432"
DB_NAME="irisx_prod"
DB_USER="irisx_admin"
DB_PASSWORD="$1"  # Pass password as first argument

if [ -z "$DB_PASSWORD" ]; then
  echo "Error: Database password required"
  echo "Usage: ./test-connection.sh <password>"
  exit 1
fi

# Test 1: Check if PostgreSQL client is installed
echo "Test 1: Checking PostgreSQL client..."
if command -v psql &> /dev/null; then
  echo "✓ psql installed: $(psql --version)"
else
  echo "✗ psql not installed. Installing..."
  sudo apt-get update && sudo apt-get install -y postgresql-client
fi
echo ""

# Test 2: Test network connectivity
echo "Test 2: Testing network connectivity to RDS..."
if nc -zv $DB_HOST $DB_PORT 2>&1 | grep -q "succeeded"; then
  echo "✓ Can reach $DB_HOST:$DB_PORT"
else
  echo "✗ Cannot reach $DB_HOST:$DB_PORT"
  echo "  Check security group allows connections from this EC2 instance"
  exit 1
fi
echo ""

# Test 3: Test database connection
echo "Test 3: Testing database authentication..."
export PGPASSWORD=$DB_PASSWORD
if psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT version();" > /dev/null 2>&1; then
  echo "✓ Successfully connected to database"
else
  echo "✗ Failed to connect to database"
  echo "  Check username/password are correct"
  exit 1
fi
echo ""

# Test 4: Show database version
echo "Test 4: Database version:"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT version();"
echo ""

# Test 5: List existing tables
echo "Test 5: Existing tables:"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "\dt"
echo ""

# Test 6: Check if migrations have been run
echo "Test 6: Checking migration status..."
TABLE_COUNT=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)

if [ "$TABLE_COUNT" -eq "0" ]; then
  echo "⚠ No tables found. Migrations not yet run."
  echo "  Run: psql -h $DB_HOST -U $DB_USER -d $DB_NAME < migrations/001_create_core_tables.sql"
elif [ "$TABLE_COUNT" -ge "10" ]; then
  echo "✓ Found $TABLE_COUNT tables. Migrations appear to be complete."
else
  echo "⚠ Found $TABLE_COUNT tables. Expected 10+ tables."
  echo "  You may need to run migrations."
fi
echo ""

echo "========================================="
echo "✓ Database connection test complete!"
echo "========================================="
