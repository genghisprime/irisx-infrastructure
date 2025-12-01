#!/bin/bash
# Quick Start Script for Local IRISX Development
# This starts both the API and Admin Portal locally

set -e

echo "========================================="
echo "   IRISX Local Development - Quick Start"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if API is already running
if lsof -ti:3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Port 3000 is already in use. Stopping existing process...${NC}"
    kill $(lsof -ti:3000) 2>/dev/null || true
    sleep 2
fi

# Check if admin portal is already running
if lsof -ti:5173 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Port 5173 is already in use. Stopping existing process...${NC}"
    kill $(lsof -ti:5173) 2>/dev/null || true
    sleep 2
fi

echo -e "${BLUE}📦 Step 1: Starting API Server...${NC}"
cd /Users/gamer/Documents/GitHub/IRISX/api

# Start API in background
node src/index.js > /tmp/irisx-api-dev.log 2>&1 &
API_PID=$!
echo -e "${GREEN}✓ API starting (PID: $API_PID)${NC}"
echo "  Logs: tail -f /tmp/irisx-api-dev.log"

# Wait for API to be ready
echo -e "${BLUE}⏳ Waiting for API to start...${NC}"
sleep 5

# Check if API is responding
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API is running at http://localhost:3000${NC}"
else
    echo -e "${YELLOW}⚠️  API started but health check failed (Redis timeout is OK)${NC}"
fi

echo ""
echo -e "${BLUE}📦 Step 2: Starting Admin Portal...${NC}"
cd /Users/gamer/Documents/GitHub/IRISX/irisx-admin-portal

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📥 Installing admin portal dependencies...${NC}"
    npm install
fi

# Start admin portal in background
npm run dev > /tmp/irisx-admin-dev.log 2>&1 &
ADMIN_PID=$!
echo -e "${GREEN}✓ Admin Portal starting (PID: $ADMIN_PID)${NC}"
echo "  Logs: tail -f /tmp/irisx-admin-dev.log"

# Wait for admin portal to be ready
echo -e "${BLUE}⏳ Waiting for Admin Portal to start...${NC}"
sleep 5

echo ""
echo "========================================="
echo -e "${GREEN}✅ LOCAL DEVELOPMENT READY!${NC}"
echo "========================================="
echo ""
echo -e "${GREEN}🌐 Admin Portal:${NC} http://localhost:5173"
echo -e "${GREEN}🔌 API Server:${NC}   http://localhost:3000"
echo ""
echo -e "${BLUE}📊 View Logs:${NC}"
echo "  API:          tail -f /tmp/irisx-api-dev.log"
echo "  Admin Portal: tail -f /tmp/irisx-admin-dev.log"
echo ""
echo -e "${BLUE}🛑 Stop Servers:${NC}"
echo "  ./stop-local-dev.sh"
echo "  OR manually:"
echo "    kill $API_PID $ADMIN_PID"
echo ""
echo -e "${YELLOW}💡 Tip:${NC} Changes to API require restart, Admin Portal auto-reloads!"
echo ""

# Save PIDs for stop script
echo "$API_PID" > /tmp/irisx-api-pid
echo "$ADMIN_PID" > /tmp/irisx-admin-pid

# Keep script running and show logs
echo "Press Ctrl+C to stop watching logs (servers will keep running)"
echo ""
tail -f /tmp/irisx-api-dev.log /tmp/irisx-admin-dev.log
