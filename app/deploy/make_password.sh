#!/usr/bin/env bash
# Create deploy/htpasswd for the site password (nginx basic auth). Usage: deploy/make_password.sh <user> [password]
# Without a password one is generated and printed. Run again to replace the file. The file is not committed (.gitignore).
set -euo pipefail
cd "$(dirname "$0")"
user="${1:?usage: make_password.sh <user> [password]}"
pw="${2:-$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-14)}"
printf '%s:%s\n' "$user" "$(openssl passwd -apr1 "$pw")" > htpasswd
chmod 644 htpasswd      # the container user must be able to read it; it holds only a hash
echo "user: $user"; echo "password: $pw"; echo "written: $(pwd)/htpasswd"
