#!/usr/bin/env bash
# Lexoire installer — installs CLI dependencies then downloads the latest release
# Usage: curl -fsSL https://raw.githubusercontent.com/yaseenshady/Lexoire/main/install.sh | bash

set -euo pipefail

REPO="yaseenshady/Lexoire"
API="https://api.github.com/repos/${REPO}/releases/latest"
BASE="https://github.com/${REPO}/releases/latest"

echo ""
echo "  LEXOIRE — voice command infrastructure"
echo ""

OS="$(uname -s)"
ARCH="$(uname -m)"

# ---------------------------------------------------------------------------
# Helper: install GitHub CLI + gh-copilot extension + Claude CLI
# ---------------------------------------------------------------------------
install_cli_deps() {
  echo "  ── CLI dependencies ──────────────────────────────────────────"

  # ── GitHub CLI ──────────────────────────────────────────────────────────
  if command -v gh &>/dev/null; then
    echo "  ✅ GitHub CLI already installed ($(gh --version | head -1))"
  else
    echo "  📦 Installing GitHub CLI..."
    case "$OS" in
      Darwin)
        if command -v brew &>/dev/null; then
          brew install gh
        else
          echo "  ⚠️  Homebrew not found. Install gh manually: https://cli.github.com"
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
        elif command -v pacman &>/dev/null; then
          sudo pacman -S --noconfirm github-cli
        else
          echo "  ⚠️  Could not detect package manager. Install gh manually: https://cli.github.com"
        fi
        ;;
      MINGW*|MSYS*|CYGWIN*|Windows_NT)
        if command -v winget &>/dev/null; then
          winget install --silent GitHub.cli
        elif command -v scoop &>/dev/null; then
          scoop install gh
        elif command -v choco &>/dev/null; then
          choco install gh -y
        else
          echo "  ⚠️  No package manager found. Install gh manually: https://cli.github.com"
        fi
        ;;
    esac
  fi

  # ── GitHub Copilot extension ─────────────────────────────────────────────
  if command -v gh &>/dev/null; then
    if gh copilot --version &>/dev/null 2>&1; then
      echo "  ✅ GitHub Copilot CLI extension already installed"
    else
      echo "  📦 Installing GitHub Copilot CLI extension..."
      gh extension install github/gh-copilot || \
        echo "  ⚠️  Could not install gh-copilot. Run: gh extension install github/gh-copilot"
    fi
  fi

  # ── Claude CLI ───────────────────────────────────────────────────────────
  if command -v claude &>/dev/null; then
    echo "  ✅ Claude CLI already installed ($(claude --version 2>/dev/null | head -1))"
  else
    echo "  📦 Installing Claude CLI..."
    if command -v npm &>/dev/null; then
      npm install -g @anthropic-ai/claude-code || \
        echo "  ⚠️  npm install failed. Try: sudo npm install -g @anthropic-ai/claude-code"
    else
      echo "  ⚠️  npm not found. Install Node.js 22+ first, then run:"
      echo "       npm install -g @anthropic-ai/claude-code"
    fi
  fi

  echo "  ──────────────────────────────────────────────────────────────"
  echo ""
}

install_cli_deps

echo "  Fetching latest Lexoire release..."
echo ""

pick_asset() {
  local assets="$1"
  case "$OS" in
    Darwin)
      if [[ "$ARCH" == "arm64" ]]; then
        echo "$assets" | grep -Ei '\.dmg$' | grep -Ei 'arm64|universal' | head -1 \
          || echo "$assets" | grep -Ei '\.dmg$' | head -1
      else
        echo "$assets" | grep -Ei '\.dmg$' | grep -Ei 'x64|universal' | head -1 \
          || echo "$assets" | grep -Ei '\.dmg$' | head -1
      fi
      ;;
    Linux)
      echo "$assets" | grep -Ei '\.AppImage$' | head -1 \
        || echo "$assets" | grep -Ei '\.deb$' | head -1
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      echo "$assets" | grep -Ei '\-setup\.exe$' | head -1 \
        || echo "$assets" | grep -Ei '\.exe$' | head -1
      ;;
  esac
}

if command -v curl &>/dev/null; then
  RAW=$(curl -fsSL "$API" 2>/dev/null || echo "")
else
  echo "  curl not found. Open $BASE to download manually."
  exit 1
fi

if [[ -z "$RAW" ]]; then
  echo "  Could not reach GitHub API. Open $BASE to download manually."
  exit 1
fi

URLS=$(echo "$RAW" | grep '"browser_download_url"' | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/')
ASSET=$(pick_asset "$URLS")

if [[ -z "$ASSET" ]]; then
  echo "  No matching asset found for $OS/$ARCH."
  echo "  Open $BASE to download manually."
  exit 1
fi

FILENAME="${ASSET##*/}"
DEST="$HOME/Downloads/$FILENAME"

echo "  Downloading $FILENAME..."
curl -fSL --progress-bar "$ASSET" -o "$DEST"

echo ""
echo "  Downloaded to $DEST"

case "$FILENAME" in
  *.dmg)
    echo "  Open the .dmg and drag Lexoire to /Applications."
    ;;
  *.AppImage)
    chmod +x "$DEST"
    echo "  Run: $DEST"
    ;;
  *.deb)
    echo "  Install: sudo dpkg -i $DEST"
    ;;
  *.exe)
    echo "  Run the installer: $DEST"
    ;;
esac

echo ""
