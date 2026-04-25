#!/bin/bash

# JARVIS Electron App Startup Script
# This script starts the JARVIS application as an Electron app
# Usage: ./start-electron.sh

set -e

cd "$(dirname "$0")"

echo "🚀 Starting JARVIS Electron Application..."

# Check if builds exist
if [ ! -d "backend/dist" ]; then
    echo "❌ Backend not built. Running build..."
    npm run build
fi

if [ ! -d "frontend/dist" ]; then
    echo "❌ Frontend not built. Running build..."
    npm run build
fi

# Start the Electron app
echo "📦 Launching Electron app..."
npm run electron

