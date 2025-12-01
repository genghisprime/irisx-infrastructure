#!/bin/bash
# Deploy IRISX API to Production

set -e

echo "🚀 Deploying IRISX API to production..."

# Copy new route files
echo "📁 Copying new admin routes..."
scp -i ~/.ssh/irisx-prod-key.pem \
  api/src/routes/admin-database.js \
  api/src/routes/admin-cache.js \
  api/src/routes/admin-queues.js \
  api/src/routes/admin-campaigns.js \
  api/src/routes/admin-webhooks.js \
  ubuntu@54.160.220.243:/tmp/

# SSH and deploy
echo "🔧 Deploying files and restarting API..."
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243 << 'ENDSSH'
  # Find API directory
  API_DIR=$(sudo find /opt /srv /var/www /home -name "admin-dashboard.js" -path "*/routes/*" 2>/dev/null | head -1 | xargs dirname)

  if [ -z "$API_DIR" ]; then
    echo "❌ Could not find API routes directory"
    exit 1
  fi

  echo "📍 Found API routes at: $API_DIR"

  # Copy new routes
  sudo cp /tmp/admin-database.js "$API_DIR/"
  sudo cp /tmp/admin-cache.js "$API_DIR/"
  sudo cp /tmp/admin-queues.js "$API_DIR/"
  sudo cp /tmp/admin-campaigns.js "$API_DIR/"
  sudo cp /tmp/admin-webhooks.js "$API_DIR/"

  # Update index.js
  INDEX_FILE=$(dirname "$API_DIR")/index.js
  echo "📝 Updating $INDEX_FILE..."

  # Find Node process and restart
  NODE_PID=$(ps aux | grep 'node.*index.js' | grep -v grep | awk '{print $2}' | head -1)

  if [ -n "$NODE_PID" ]; then
    echo "🔄 Restarting Node.js process (PID: $NODE_PID)..."
    sudo kill -HUP $NODE_PID || sudo systemctl restart irisx-api || echo "Manual restart may be needed"
  else
    echo "⚠️  No Node.js process found - may need manual restart"
  fi

  # Cleanup
  rm -f /tmp/admin-*.js

  echo "✅ Deployment complete!"
ENDSSH

echo "🎉 API deployment finished!"
