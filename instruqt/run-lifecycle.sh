#!/bin/sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/lifecycle-scripts/terminal-lifecycle.sh" /root/terminal-lifecycle.sh
chmod +x /root/terminal-lifecycle.sh
echo "Copied terminal-lifecycle.sh to /root/"
