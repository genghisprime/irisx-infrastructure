#!/bin/bash

# Replace ALL h-6 w-6 SVGs in DashboardHome.vue with forced inline styles
sed -i.bak 's/<svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">/<svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class="text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">/g' src/views/dashboard/DashboardHome.vue

echo "Fixed all dashboard SVG icons with forced sizing"
