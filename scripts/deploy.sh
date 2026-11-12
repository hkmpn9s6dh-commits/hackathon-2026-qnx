#!/usr/bin/env bash
# Publish the built bundle to the gh-pages branch, which GitHub Pages serves.
# That branch is a build artefact generated from dist/ — never edited by hand.
set -eu
cd "$(dirname "$0")/.."

npm run build
remote=$(git remote get-url origin)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp -r dist/. "$work"/
touch "$work/.nojekyll"

cd "$work"
git init -q
git add -A
git -c user.name="CB 主駕" -c user.email="cb@local" commit -q -m "publish $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f "$remote" HEAD:gh-pages
echo "published: $remote (gh-pages)"
