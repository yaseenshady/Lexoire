#!/bin/bash

echo "🤖 Starting Lexoire Voice Automation System..."
echo ""

# ── GitHub CLI ────────────────────────────────────────────────────────────────
if ! command -v gh &> /dev/null; then
    echo "📦 GitHub CLI not found. Installing..."
    OS="$(uname -s)"
    case "$OS" in
      Darwin)
        if command -v brew &>/dev/null; then
            brew install gh
        else
            echo "❌ Homebrew not found. Install GitHub CLI manually: https://cli.github.com"
            exit 1
        fi
        ;;
      Linux)
        if command -v apt-get &>/dev/null; then
            curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
              | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
              | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
            sudo apt-get update -qq && sudo apt-get install -y gh
        elif command -v dnf &>/dev/null; then
            sudo dnf install -y gh
        else
            echo "❌ Could not detect package manager. Install gh manually: https://cli.github.com"
            exit 1
        fi
        ;;
      *)
        echo "❌ Unsupported OS. Install GitHub CLI manually: https://cli.github.com"
        exit 1
        ;;
    esac
fi

echo "✅ GitHub CLI found"

# ── GitHub Copilot extension ──────────────────────────────────────────────────
if ! gh copilot --version &> /dev/null 2>&1; then
    echo "📦 GitHub Copilot CLI extension not found. Installing..."
    if ! gh extension install github/gh-copilot; then
        echo "❌ Failed to install gh-copilot extension."
        echo "   Run manually: gh extension install github/gh-copilot"
        exit 1
    fi
fi

echo "✅ GitHub Copilot CLI found"

# ── Claude CLI ────────────────────────────────────────────────────────────────
if ! command -v claude &> /dev/null; then
    echo "📦 Claude CLI not found. Installing..."
    if command -v npm &>/dev/null; then
        npm install -g @anthropic-ai/claude-code || {
            echo "❌ Failed to install Claude CLI."
            echo "   Run manually: sudo npm install -g @anthropic-ai/claude-code"
            exit 1
        }
    else
        echo "❌ npm not found. Install Node.js 22+ first, then run:"
        echo "   npm install -g @anthropic-ai/claude-code"
        exit 1
    fi
fi

echo "✅ Claude CLI found"
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
echo "   Memory:   SQLite at backend/lexoire.db"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm run dev
