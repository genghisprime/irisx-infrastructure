#!/usr/bin/env bash
# Deploy all admin portal API fixes to production

set -e

echo "🔧 Deploying Admin Portal API Fixes..."
echo ""

# Files to deploy
FILES=(
  "api/src/routes/admin-tenants.js"
  "api/src/routes/admin-billing.js"
)

SERVER="ubuntu@3.83.53.69"
KEY="~/.ssh/irisx-prod-key.pem"
DEST_DIR="/home/ubuntu/irisx-backend/src/routes"

echo "📦 Copying files to production..."
for file in "${FILES[@]}"; do
  echo "  ✓ $file"
  scp -i "$KEY" "$file" "$SERVER:$DEST_DIR/"
done

echo ""
echo "🔄 Restarting API server..."
ssh -i "$KEY" "$SERVER" "sudo lsof -ti:3000 | xargs -r sudo kill -9 && cd /home/ubuntu/irisx-backend && nohup node src/index.js > /tmp/api-console.log 2>&1 &"

echo ""
echo "⏳ Waiting for API to start..."
sleep 5

echo ""
echo "✅ Checking API health..."
ssh -i "$KEY" "$SERVER" "curl -s http://localhost:3000/health | jq -c '{status, database: .database.status, redis: .redis.status}'"

echo ""
echo "🎉 Deployment complete!"
