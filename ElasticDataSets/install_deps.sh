#!/usr/bin/env bash
# Install Python dependencies used by ElasticDataSets ingest scripts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Installing ElasticDataSets Python dependencies...${NC}"

python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

echo -e "${GREEN}Done. Installed packages from requirements.txt:${NC}"
echo "  - elasticsearch (>=8.12.0,<10)"
echo "  - python-dotenv (==1.0.1)"
echo "  - pandas (>=1.5.0)"
