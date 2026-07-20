#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Python virtual environment...${NC}"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}Virtual environment created.${NC}"
else
    echo -e "${GREEN}Virtual environment already exists.${NC}"
fi

# Activate virtual environment
echo -e "${GREEN}Activating virtual environment...${NC}"
# shellcheck disable=SC1091
source venv/bin/activate

# Install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
pip install -r requirements.txt

# Check if variables.env exists
if [ ! -f variables.env ]; then
    echo -e "${RED}Error: variables.env file not found${NC}"
    echo -e "${RED}Copy variables.env.template to variables.env and fill in your Elastic Cloud credentials.${NC}"
    exit 1
fi

# Read variables from variables.env
# shellcheck disable=SC1091
source variables.env

# Validate required variables
if [ -z "$ES_URL" ] || [ -z "$ES_API_KEY" ]; then
    echo -e "${RED}Error: ES_URL and ES_API_KEY must be set in variables.env${NC}"
    exit 1
fi

# Validate URL format
if [[ ! $ES_URL =~ ^https?:// ]]; then
    echo -e "${RED}Error: ES_URL must start with http:// or https://${NC}"
    exit 1
fi

# Create .env file for python-dotenv
# Derive Kibana URL from ES_URL when KIBANA_URL is not set (Elastic Cloud .es. → .kb.)
if [ -z "${KIBANA_URL:-}" ] && [[ "${ES_URL}" == *".es."* ]]; then
    KIBANA_URL="${ES_URL/.es./.kb.}"
fi

cat > .env << EOL
# Elasticsearch Configuration
ES_URL=$ES_URL
ES_API_KEY=$ES_API_KEY
KIBANA_URL=${KIBANA_URL:-}
ELSER_INFERENCE_ID=${ELSER_INFERENCE_ID:-.elser-2-elasticsearch}
EMBEDDING_INFERENCE_ID=${EMBEDDING_INFERENCE_ID:-jina-embeddings-v3}
JINA_MODEL_ID=${JINA_MODEL_ID:-jina-embeddings-v3}
E5_INFERENCE_ID=${E5_INFERENCE_ID:-.multilingual-e5-small-elasticsearch}
INGEST_BULK_SIZE=${INGEST_BULK_SIZE:-200}
INGEST_THREAD_COUNT=${INGEST_THREAD_COUNT:-4}
INGEST_QUEUE_SIZE=${INGEST_QUEUE_SIZE:-1000}
ES_REQUEST_TIMEOUT=${ES_REQUEST_TIMEOUT:-300}

# Generated on $(date)
EOL

echo -e "${GREEN}Environment file created successfully!${NC}"

# Ensure .gitignore covers secrets / venv
if [ -f .gitignore ]; then
    grep -qxF ".env" .gitignore || echo ".env" >> .gitignore
    grep -qxF "variables.env" .gitignore || echo "variables.env" >> .gitignore
    grep -qxF "venv" .gitignore || echo "venv" >> .gitignore
else
    echo -e "${GREEN}Creating .gitignore file...${NC}"
    printf ".env\nvariables.env\nvenv\n" > .gitignore
fi

echo -e "${GREEN}Setup completed successfully!${NC}"
echo -e "${GREEN}To activate the virtual environment, run: source venv/bin/activate${NC}"
echo -e "${GREEN}Then run: python ingest.py providers   # or: python ingest.py ecommerce${NC}"

# ---------------------------------------------------------------------------
# A2A chat app (../chat-app): install deps and start proxy + Vite UI
#   proxy: http://127.0.0.1:5174
#   UI:    http://127.0.0.1:5173   (login: admin / admin)
# ---------------------------------------------------------------------------
CHAT_APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../chat-app" && pwd)"

if [ ! -d "$CHAT_APP_DIR" ]; then
    echo -e "${RED}Warning: chat-app not found at $CHAT_APP_DIR — skipping chat server startup.${NC}"
    exit 0
fi

if ! command -v npm >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}Warning: Node.js/npm not found — need Node.js 20+ for the A2A chat app.${NC}"
    exit 0
fi

node_major="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
if [ -z "$node_major" ] || [ "$node_major" -lt 20 ]; then
    echo -e "${RED}Warning: Node.js $(node -v) is too old (need 20+). Re-run terminal lifecycle or install Node 20 LTS.${NC}"
    exit 0
fi

echo -e "${GREEN}Setting up A2A chat app at $CHAT_APP_DIR (node $(node -v)) ...${NC}"
(
    cd "$CHAT_APP_DIR"
    echo -e "${GREEN}Installing/updating chat-app npm dependencies...${NC}"
    npm install --no-workspaces
)

# Start only if the UI port is free
if command -v lsof >/dev/null 2>&1 && lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
    echo -e "${GREEN}A2A chat UI already listening on :5173 — not starting another instance.${NC}"
else
    echo -e "${GREEN}Starting A2A chat (proxy :5174 + Vite :5173)...${NC}"
    (
        cd "$CHAT_APP_DIR"
        # nohup so setup_env can exit; logs go to chat-app/chat-dev.log
        nohup npm run dev >"$CHAT_APP_DIR/chat-dev.log" 2>&1 &
        echo $! >"$CHAT_APP_DIR/chat-dev.pid"
    )
    echo -e "${GREEN}Chat app starting (pid $(cat "$CHAT_APP_DIR/chat-dev.pid" 2>/dev/null || echo '?')).${NC}"
    echo -e "${GREEN}  UI:    http://127.0.0.1:5173${NC}"
    echo -e "${GREEN}  Proxy: http://127.0.0.1:5174${NC}"
    echo -e "${GREEN}  Login: admin / admin${NC}"
    echo -e "${GREEN}  Logs:  $CHAT_APP_DIR/chat-dev.log${NC}"
    echo -e "${GREEN}  Stop:  kill \$(cat $CHAT_APP_DIR/chat-dev.pid)${NC}"
fi
