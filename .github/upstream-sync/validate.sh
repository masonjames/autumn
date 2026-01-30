#!/usr/bin/env bash
# Autumn Fork Validation Script
# Validates that fork-owned customizations survive upstream merges.
# Exit 0 = passed, Exit 1 = failed
#
# Fork customizations to preserve:
#   1. Sparka SSO integration (cross-subdomain auth)
#   2. Self-hosted mode (static frontend serving, health check)
#   3. TRUSTED_ORIGIN env var support
#   4. CI/CD automation (GHCR build, sync, Trivy, Dependabot)
#   5. Docker build customizations (self-hosted Dockerfile)

set -euo pipefail

ERRORS=""

echo "Validating Autumn fork customizations..."

# --- Sparka SSO Integration ---
echo "  Checking Sparka SSO integration..."

if [ ! -f "server/src/middleware/sparkaSessionMiddleware.ts" ]; then
  ERRORS="$ERRORS\n  - server/src/middleware/sparkaSessionMiddleware.ts missing (Sparka SSO middleware)"
fi

if [ ! -f "server/src/routers/sparkaRouter.ts" ]; then
  ERRORS="$ERRORS\n  - server/src/routers/sparkaRouter.ts missing (Sparka SSO routes)"
fi

# Check that init.ts imports sparkaRouter
if [ -f "server/src/init.ts" ]; then
  if ! grep -q "sparkaRouter\|sparka" "server/src/init.ts"; then
    ERRORS="$ERRORS\n  - server/src/init.ts does not reference sparkaRouter (SSO integration may be disconnected)"
  fi
fi

# --- Self-Hosted Mode ---
echo "  Checking self-hosted mode..."

if [ -f "server/src/init.ts" ]; then
  if ! grep -q "SELF_HOSTED\|selfHosted\|static.*frontend\|serveStatic\|public" "server/src/init.ts"; then
    ERRORS="$ERRORS\n  - server/src/init.ts may be missing self-hosted frontend serving logic"
  fi
fi

if [ -f "server/src/initHono.ts" ]; then
  if ! grep -q "/health" "server/src/initHono.ts"; then
    ERRORS="$ERRORS\n  - server/src/initHono.ts missing /health endpoint"
  fi
fi

# --- TRUSTED_ORIGIN Support ---
echo "  Checking TRUSTED_ORIGIN support..."

if [ -f "server/src/utils/auth.ts" ]; then
  if ! grep -q "TRUSTED_ORIGIN" "server/src/utils/auth.ts"; then
    ERRORS="$ERRORS\n  - server/src/utils/auth.ts missing TRUSTED_ORIGIN env var support"
  fi
fi

# --- Docker Build ---
echo "  Checking Docker build..."

if [ ! -f "docker/Dockerfile" ]; then
  ERRORS="$ERRORS\n  - docker/Dockerfile missing"
fi

# --- CI/CD Workflows ---
echo "  Checking CI/CD workflows..."

if [ ! -f ".github/workflows/ghcr-build.yml" ]; then
  ERRORS="$ERRORS\n  - .github/workflows/ghcr-build.yml missing (GHCR build + Dokploy deploy)"
fi

if [ ! -f ".github/workflows/upstream-sync-check.yml" ]; then
  ERRORS="$ERRORS\n  - .github/workflows/upstream-sync-check.yml missing (weekly upstream check)"
fi

if [ ! -f ".github/workflows/upstream-sync-pr.yml" ]; then
  ERRORS="$ERRORS\n  - .github/workflows/upstream-sync-pr.yml missing (sync PR creator)"
fi

if [ ! -f ".github/workflows/trivy-scan.yml" ]; then
  ERRORS="$ERRORS\n  - .github/workflows/trivy-scan.yml missing (security scanning)"
fi

# Check GHCR build uses platform reusable workflow
if [ -f ".github/workflows/ghcr-build.yml" ]; then
  if ! grep -q "masonjames/platform-infra/.github/workflows/ghcr-build-webhook.yml" ".github/workflows/ghcr-build.yml"; then
    ERRORS="$ERRORS\n  - .github/workflows/ghcr-build.yml does not use platform-infra reusable workflow"
  fi
fi

# --- Results ---
echo ""
if [ -n "$ERRORS" ]; then
  echo "VALIDATION FAILED - Fork customizations missing:"
  echo -e "$ERRORS"
  exit 1
else
  echo "VALIDATION PASSED - All fork customizations preserved"
  exit 0
fi
