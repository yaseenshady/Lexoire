#!/usr/bin/env bash
# Lexoire installer — downloads the latest release for your platform
# Usage: curl -fsSL https://raw.githubusercontent.com/yaseensh/Lexoire/main/install.sh | bash

set -euo pipefail

REPO="yaseensh/Lexoire"
API="https://api.github.com/repos/${REPO}/releases/latest"
BASE="https://github.com/${REPO}/releases/latest"

echo ""
echo "  LEXOIRE — voice command infrastructure"
echo "  Fetching latest release..."
echo ""

OS="$(uname -s)"
ARCH="$(uname -m)"

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
