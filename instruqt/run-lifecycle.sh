#!/bin/sh

set -e

curl -fsSL https://raw.githubusercontent.com/bommas/Dell-AIDP-DDSE-Workshop/refs/heads/main/instruqt/lifecycle-scripts/terminal-lifecycle.sh -o /root/terminal-lifecycle.sh
chmod +x /root/terminal-lifecycle.sh
echo "Downloaded terminal-lifecycle.sh to /root/"
sh /root/terminal-lifecycle.sh
