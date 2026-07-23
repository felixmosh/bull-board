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
  trust_info=$(npm trust list "$pkg" --json 2>/dev/null) || trust_info='{}'
  if echo "$trust_info" | jq -e '.id' >/dev/null 2>&1; then
    echo "✓ $pkg already has trusted publishing configured, skipping"
    continue
  fi

  echo "Configuring trusted publishing for $pkg..."
  npm trust github "$pkg" --repo "$REPO_NAME" --file "$WORKFLOW_FILE" --allow-publish --yes
  sleep 2
done
