#!/bin/sh
set -eu
umask 077

archive=${1:?Usage: update-web.sh /absolute/path/to/release.tar.gz}
case "$archive" in /*) ;; *) echo "Archive path must be absolute" >&2; exit 1;; esac
app=/opt/github-star-manager
backups=/opt/github-star-manager-backups
test -d "$app/dist"
test -f "$archive"
mkdir -p "$backups"
backup="$backups/$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar -czf "$backup" --exclude=./node_modules -C "$app" .

rollback() {
  trap - EXIT
  echo "Update failed; restoring $backup" >&2
  tar -xzf "$backup" -C "$app"
  (cd "$app" && npm ci --omit=dev --no-fund)
  systemctl restart github-star-manager
  exit 1
}
trap rollback EXIT

# Release archives contain only source, configuration and built assets, never secrets.
tar -xzf "$archive" -C "$app"
cd "$app"
npm ci --omit=dev --no-fund
systemctl restart github-star-manager
curl --noproxy '*' --fail --silent --retry 10 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:4173/github-manager/ -o /dev/null
systemctl is-active --quiet github-star-manager
trap - EXIT
printf 'Updated successfully. Backup: %s\n' "$backup"
