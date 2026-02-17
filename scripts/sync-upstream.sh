#!/bin/bash
# AgntUX Upstream Sync Script
# Automates syncing with upstream MCPJam/inspector
# Usage: ./scripts/sync-upstream.sh

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

SYNC_REPORT_DIR="$(git rev-parse --show-toplevel)/.sync-reports"
UPSTREAM_URL="https://github.com/MCPJam/inspector.git"

# Step 1: Check for uncommitted changes
info "Checking for uncommitted changes..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  error "Working tree is dirty. Please commit or stash your changes first."
  git status --short
  exit 1
fi
success "Working tree is clean."

# Step 2: Verify upstream remote exists
info "Checking for upstream remote..."
if ! git remote get-url upstream &>/dev/null; then
  warn "Upstream remote not found."
  echo -en "${YELLOW}Add upstream remote (${UPSTREAM_URL})? [y/N] ${NC}"
  read -r answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    git remote add upstream "$UPSTREAM_URL"
    success "Upstream remote added."
  else
    error "Cannot proceed without upstream remote."
    exit 1
  fi
else
  success "Upstream remote found: $(git remote get-url upstream)"
fi

# Step 3: Fetch from upstream
info "Fetching from upstream..."
git fetch upstream
success "Fetch complete."

# Step 4: Checkout main branch
info "Switching to main branch..."
git checkout main
success "On main branch."

# Record current HEAD before merge
BEFORE_SHA=$(git rev-parse HEAD)

# Step 5: Merge upstream/main into main
info "Merging upstream/main into main..."
if ! git merge upstream/main --no-edit; then
  error "Merge conflicts detected! Resolve them manually, then re-run this script."
  echo ""
  warn "Conflicting files:"
  git diff --name-only --diff-filter=U
  # Write partial sync report
  mkdir -p "$SYNC_REPORT_DIR"
  REPORT="$SYNC_REPORT_DIR/sync-$(date +%Y%m%d-%H%M%S).md"
  cat > "$REPORT" <<EOF
# Upstream Sync Report
- **Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
- **Status**: CONFLICT
- **Upstream commit**: $(git rev-parse upstream/main)
- **Conflicting files**:
$(git diff --name-only --diff-filter=U | sed 's/^/  - /')
EOF
  warn "Partial sync report saved to: $REPORT"
  exit 1
fi

AFTER_SHA=$(git rev-parse HEAD)

# Step 6: Show summary of changes
echo ""
info "=== Sync Summary ==="
if [ "$BEFORE_SHA" = "$AFTER_SHA" ]; then
  success "Already up to date. No new changes from upstream."
else
  echo -e "${GREEN}Changes merged:${NC}"
  git log --oneline "$BEFORE_SHA".."$AFTER_SHA"
  echo ""
  git diff --stat "$BEFORE_SHA".."$AFTER_SHA"
fi

# Step 7: Ask about rebasing agntux-main
echo ""
echo -en "${YELLOW}Rebase agntux-main onto updated main? [y/N] ${NC}"
read -r rebase_answer
if [[ "$rebase_answer" =~ ^[Yy]$ ]]; then
  # Step 8: Checkout agntux-main and rebase
  info "Checking out agntux-main..."
  if ! git checkout agntux-main 2>/dev/null; then
    warn "Branch agntux-main does not exist. Skipping rebase."
  else
    info "Rebasing agntux-main onto main..."
    if ! git rebase main; then
      error "Rebase conflicts detected! Resolve them manually."
      warn "Use 'git rebase --continue' after resolving, or 'git rebase --abort' to cancel."
      exit 1
    fi
    success "Rebase complete."
  fi
else
  info "Skipping rebase of agntux-main."
fi

# Step 9: Run tests
echo ""
info "Running tests..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
if (cd "$PROJECT_ROOT/mcpjam-inspector" && npm test); then
  success "All tests passed."
  TEST_RESULT="PASS"
else
  warn "Some tests failed. Review output above."
  TEST_RESULT="FAIL"
fi

# Step 10: Create sync report
mkdir -p "$SYNC_REPORT_DIR"
REPORT="$SYNC_REPORT_DIR/sync-$(date +%Y%m%d-%H%M%S).md"
cat > "$REPORT" <<EOF
# Upstream Sync Report
- **Date**: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
- **Status**: SUCCESS
- **Before**: $BEFORE_SHA
- **After**: $AFTER_SHA
- **Upstream commit**: $(git rev-parse upstream/main)
- **Tests**: $TEST_RESULT
- **Changes**: $(git log --oneline "$BEFORE_SHA".."$AFTER_SHA" 2>/dev/null | wc -l | tr -d ' ') commits merged
EOF

success "Sync report saved to: $REPORT"
echo ""
success "Upstream sync complete!"
