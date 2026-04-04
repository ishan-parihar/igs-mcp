#!/usr/bin/env bash
#
# IGS MCP Server — One-Line Setup
# Usage: git clone && cd igs-mcp && ./setup.sh
#
set -euo pipefail

# ─── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Helpers ───────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()      { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()     { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()    { echo -e "\n${BOLD}━━━ $* ━━━${NC}"; }
separator() { echo -e "${CYAN}$(printf '=%.0s' {1..70})${NC}"; }

# ─── 0. Validate we're in the repo ────────────────────────────────
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -f "$REPO_DIR/package.json" ]] || [[ ! -d "$REPO_DIR/src" ]]; then
  err "setup.sh must be run from inside the igs-mcp repository."
  err "Usage:"
  echo "  git clone https://github.com/ishan-parihar/igs-mcp.git"
  echo "  cd igs-mcp"
  echo "  ./setup.sh"
  exit 1
fi

cd "$REPO_DIR"

separator
echo -e "${BOLD}  IGS MCP Server — Interactive Setup${NC}"
echo -e "  Intelligence Gathering System${NC}"
separator
echo ""

# ─── 1. Check Prerequisites ───────────────────────────────────────
step "Checking prerequisites"

# Node.js
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install Node.js v20 or later:"
  echo "  https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d. -f1 | sed 's/v//')
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  err "Node.js v${NODE_MAJOR} detected. IGS requires Node.js v20 or later."
  echo "  Current: $(node -v)"
  echo "  Install LTS: https://nodejs.org/"
  exit 1
fi
ok "Node.js $(node -v)"

# npm
if ! command -v npm &>/dev/null; then
  err "npm not found. It ships with Node.js — try reinstalling Node.js."
  exit 1
fi
ok "npm $(npm -v)"

# Detect OS
OS_TYPE=$(uname -s 2>/dev/null || echo "Windows")
case "$OS_TYPE" in
  Linux*)   OS_NAME="linux";;
  Darwin*)  OS_NAME="macos";;
  *)        OS_NAME="windows";;
esac
ok "Platform: $OS_NAME ($OS_TYPE)"

echo ""

# ─── 2. Install Dependencies ──────────────────────────────────────
step "Installing dependencies"

if [[ -d "node_modules" ]]; then
  info "node_modules exists — refreshing with npm ci for reproducible install"
  npm ci 2>/dev/null || npm install
else
  npm install
fi
ok "Dependencies installed"
echo ""

# ─── 3. Build ─────────────────────────────────────────────────────
step "Building TypeScript"

npm run build
ok "Build complete → dist/"
echo ""

# ─── 4. Bootstrap Config ──────────────────────────────────────────
step "Setting up configuration"

# Determine user config directory
if [[ -n "${IGS_CONFIG_DIR:-}" ]]; then
  USER_CFG_DIR="$IGS_CONFIG_DIR"
elif [[ "$OS_NAME" == "windows" ]]; then
  USER_CFG_DIR="${APPDATA:-$HOME/AppData/Roaming}/igs-mcp"
else
  USER_CFG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/igs-mcp"
fi

mkdir -p "$USER_CFG_DIR"
ok "Config directory: $USER_CFG_DIR"

# Copy config files if missing
BOOTSTRAP_FILES=("pools.yml" "sources.yml" "settings.yml" "countries.yml")
COPIED=0
for f in "${BOOTSTRAP_FILES[@]}"; do
  target="$USER_CFG_DIR/$f"
  src="$REPO_DIR/config/$f"
  if [[ -f "$target" ]]; then
    info "$f already exists — skipping"
  elif [[ -f "$src" ]]; then
    cp "$src" "$target"
    ok "$f copied to user config"
    COPIED=$((COPIED + 1))
  else
    warn "$f not found in repo/config — skipping"
  fi
done

if [[ "$COPIED" -eq 0 ]]; then
  info "All config files already present"
else
  ok "$COPIED config file(s) bootstrapped"
fi
echo ""

# ─── 5. Summary ───────────────────────────────────────────────────
step "Setup Summary"

# Count sources and pools
SOURCE_COUNT=$(grep -c '^\s*- id:' "$USER_CFG_DIR/sources.yml" 2>/dev/null || echo "?")
POOL_COUNT=$(grep -c '^\s*- id:' "$USER_CFG_DIR/pools.yml" 2>/dev/null || echo "?")
COUNTRY_COUNT=$(grep -c '^\s*- code:' "$REPO_DIR/config/countries.yml" 2>/dev/null || echo "?")

echo -e "  ${BOLD}Installation path:${NC} $REPO_DIR"
echo -e "  ${BOLD}Build output:${NC}      dist/server.js"
echo -e "  ${BOLD}User config:${NC}       $USER_CFG_DIR"
echo -e "  ${BOLD}Sources:${NC}            $SOURCE_COUNT news sources"
echo -e "  ${BOLD}Pools:${NC}              $POOL_COUNT news pools"
echo -e "  ${BOLD}Countries:${NC}          $COUNTRY_COUNT countries"
echo ""
ok "Installation complete!"
echo ""

# ─── 6. Claude Desktop Configuration ─────────────────────────────
separator
echo -e "${BOLD}  MCP Configuration for Claude Desktop${NC}"
separator
echo ""
info "Add this to your claude_desktop_config.json:"
echo ""

# Platform-specific config path
case "$OS_NAME" in
  macos)
    CFG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    ;;
  linux)
    CFG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
    ;;
  windows)
    CFG_PATH="%APPDATA%\Claude\claude_desktop_config.json"
    ;;
esac

echo -e "  ${YELLOW}File:${NC} $CFG_PATH"
echo ""

# Absolute path for the server
ABS_SERVER_PATH="$REPO_DIR/dist/server.js"

# Generate the JSON config
cat <<JSONEOF
{
  "mcpServers": {
    "igs": {
      "command": "node",
      "args": ["${ABS_SERVER_PATH}"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
JSONEOF

echo ""
separator
echo ""
info "After adding the config, completely restart Claude Desktop."
info "Then ask Claude: 'list the available IGS tools' to verify."
echo ""

# ─── 7. Quick Verification (optional) ─────────────────────────────
echo -ne "Run a quick server test? (y/N): "
read -r ANSWER || true

if [[ "${ANSWER,,}" == "y" ]]; then
  info "Starting server briefly to verify... (will auto-stop)"
  if timeout 3 npm start 2>&1 | head -5; then
    ok "Server started successfully"
  else
    warn "Server test inconclusive — check manually with: npm start"
  fi
  echo ""
fi

separator
echo -e "${GREEN}${BOLD}  Setup complete. Happy intelligence gathering!${NC}"
separator
echo ""
