#!/bin/bash
# Stop Local Development Servers

echo "Stopping IRISX local development servers..."

# Kill by PID files if they exist
if [ -f /tmp/irisx-api-pid ]; then
    API_PID=$(cat /tmp/irisx-api-pid)
    if ps -p $API_PID > /dev/null 2>&1; then
        echo "  ✓ Stopping API (PID: $API_PID)"
        kill $API_PID 2>/dev/null || true
    fi
    rm /tmp/irisx-api-pid
fi

if [ -f /tmp/irisx-admin-pid ]; then
    ADMIN_PID=$(cat /tmp/irisx-admin-pid)
    if ps -p $ADMIN_PID > /dev/null 2>&1; then
        echo "  ✓ Stopping Admin Portal (PID: $ADMIN_PID)"
        kill $ADMIN_PID 2>/dev/null || true
    fi
    rm /tmp/irisx-admin-pid
fi

# Cleanup any processes still on the ports
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "  ✓ Cleaning up port 3000"
    kill $(lsof -ti:3000) 2>/dev/null || true
fi

if lsof -ti:5173 > /dev/null 2>&1; then
    echo "  ✓ Cleaning up port 5173"
    kill $(lsof -ti:5173) 2>/dev/null || true
fi

echo "✓ All servers stopped"
