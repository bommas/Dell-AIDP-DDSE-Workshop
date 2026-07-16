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
cat > .env << EOL
# Elasticsearch Configuration
ES_URL=$ES_URL
ES_API_KEY=$ES_API_KEY
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
