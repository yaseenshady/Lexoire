#!/bin/bash

echo "🤖 Starting JARVIS Voice Automation System..."
echo ""

# Check if GitHub Copilot CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI not found. Please install it first:"
    echo "   brew install gh"
    exit 1
fi

if ! gh copilot --version &> /dev/null; then
    echo "❌ GitHub Copilot CLI not installed. Install it with:"
    echo "   gh extension install github/gh-copilot"
    exit 1
fi

echo "✅ GitHub Copilot CLI found"
echo ""

# Check if dependencies are installed
if [ ! -d "frontend/node_modules" ] || [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm run install:all
    echo ""
fi

echo "🚀 Starting development servers..."
echo ""
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5000"
echo "   Memory:   SQLite at backend/jarvis.db"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm run dev
