#!/bin/bash
# Restart Production API Server
# Run this script to cleanly restart the API after the CDR deployment

echo "🔄 Restarting Production API Server..."
echo ""

ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69 << 'ENDSSH'
echo "Step 1: Killing all Node processes..."
pkill -9 -f node
sleep 3

echo ""
echo "Step 2: Starting API server..."
cd ~/irisx-backend
nohup node src/index.js > /tmp/api-production.log 2>&1 &
sleep 8

echo ""
echo "Step 3: Verifying API is running..."
ps aux | grep 'node src/index.js' | grep -v grep | head -1

echo ""
echo "Step 4: Checking if listening on port 3000..."
ss -tlnp 2>/dev/null | grep :3000 || netstat -tlnp 2>/dev/null | grep :3000

echo ""
echo "Step 5: Recent startup log..."
tail -20 /tmp/api-production.log

echo ""
echo "✅ API restart complete!"
ENDSSH

echo ""
echo "🎉 Done! Wait 5 seconds then try logging in at http://localhost:5173/login"
