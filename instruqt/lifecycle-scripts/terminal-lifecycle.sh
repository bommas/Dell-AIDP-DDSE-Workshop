#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

echo "=== Starting Repository Setup ==="

# 1. Ensure git is installed on the image
if ! command -v git >/dev/null 2>&1; then
    echo "Git not found. Installing git..."
    apt-get update && apt-get install -y git
else
    echo "Git is already installed."
fi

# 1b. Ensure Node.js 20+ (npm) for the React A2A chat app
# Vite 5+/modern tooling need Node 20; distro `apt install npm` is often too old
# (e.g. missing node:util styleText → Rolldown/Vite crash).
need_node_install=0
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    need_node_install=1
else
    node_major="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    case "$node_major" in
        ''|*[!0-9]*) need_node_install=1 ;;
        *)
            if [ "$node_major" -lt 20 ]; then
                need_node_install=1
            fi
            ;;
    esac
fi

if [ "$need_node_install" -eq 1 ]; then
    echo "Installing Node.js 20 LTS (npm) from NodeSource..."
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "Installed node $(node -v) / npm $(npm -v)"
else
    echo "Node.js already OK ($(node -v), npm $(npm -v))."
fi

# 2. Define target directory and ensure it exists
TARGET_DIR="/root"
mkdir -p "$TARGET_DIR"

# 3. Clone the eCommerce dataset repository
echo "Cloning eCommerce-dataset-samples..."
if [ ! -d "$TARGET_DIR/eCommerce-dataset-samples" ]; then
    git clone https://github.com/sunilemanjee/eCommerce-dataset-samples "$TARGET_DIR/eCommerce-dataset-samples"
else
    echo "Directory eCommerce-dataset-samples already exists. Skipping clone."
fi

# 4. Clone the Dell workshop repository
echo "Cloning Dell-AIDP-DDSE-Workshop..."
if [ ! -d "$TARGET_DIR/Dell-AIDP-DDSE-Workshop" ]; then
    git clone https://github.com/bommas/Dell-AIDP-DDSE-Workshop "$TARGET_DIR/Dell-AIDP-DDSE-Workshop"
else
    echo "Directory Dell-AIDP-DDSE-Workshop already exists. Skipping clone."
fi

# 5. Alias python -> python3.14 for interactive shells
echo "Configuring python alias (python -> python3.14)..."
if ! grep -qxF 'alias python=python3.14' "$TARGET_DIR/.bashrc" 2>/dev/null; then
    echo 'alias python=python3.14' >> "$TARGET_DIR/.bashrc"
fi
# Also expose for login shells when /etc/profile.d is available (do not fail setup if missing)
if mkdir -p /etc/profile.d 2>/dev/null \
    && printf '%s\n' 'alias python=python3.14' > /etc/profile.d/python-alias.sh 2>/dev/null; then
    echo "Also wrote /etc/profile.d/python-alias.sh"
else
    echo "Warning: could not write /etc/profile.d/python-alias.sh; alias is in $TARGET_DIR/.bashrc only"
fi

echo "=== Setup Completed Successfully! ==="
