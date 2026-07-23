set -euo pipefail

PACKAGES=()
for pkg_dir in packages/*; do
  if [ -f "$pkg_dir/package.json" ]; then
    name=$(jq -r '.name // empty' "$pkg_dir/package.json")
    private=$(jq -r '.private // false' "$pkg_dir/package.json")
    if [ -n "$name" ] && [ "$private" != "true" ]; then
      PACKAGES+=("$name")
    fi
  fi
done

REPO_NAME="felixmosh/bull-board"
WORKFLOW_FILE="release.yml" # Must be just the filename, not the full path

for pkg in "${PACKAGES[@]}"; do
  echo "  Configuring trusted publishing for $pkg..."

  if ! npm view "$pkg" version >/dev/null 2>&1; then
    echo "  Package not found on registry, publishing placeholder stub..."
    tmpdir=$(mktemp -d)
    cat > "$tmpdir/package.json" <<-EOF
{
  "name": "$pkg",
  "version": "0.0.0",
  "description": "Stub package for npm trusted publishing setup",
  "main": "index.js",
  "publishConfig": { "access": "public" }
}
EOF
    echo "module.exports = {};" > "$tmpdir/index.js"
    if npm publish "$tmpdir" --access public 2>&1; then
      echo "  Stub published, now configuring trust..."
    else
      echo "  Failed to publish stub for $pkg, skipping"
      continue
    fi
    rm -rf "$tmpdir"
  fi

  tmpfile=$(mktemp)
  npm trust github "$pkg" --repo "$REPO_NAME" --file "$WORKFLOW_FILE" --allow-publish 2>&1 | tee "$tmpfile" || true
  exit_code=${PIPESTATUS[0]}
  if [ "$exit_code" -eq 0 ]; then
    echo "✓ $pkg configured"
  elif grep -q "E409" "$tmpfile"; then
    echo "✓ $pkg already has trusted publishing configured, skipping"
  elif grep -q "EOTP" "$tmpfile"; then
    : # npm already printed the auth URL above; user can authenticate and re-run
  elif grep -q "E404" "$tmpfile"; then
    : # npm already printed the 404 above
  else
    echo "  ✗ Failed to configure trust for $pkg"
    rm -f "$tmpfile"
    exit 1
  fi
  rm -f "$tmpfile"
  sleep 2
done
