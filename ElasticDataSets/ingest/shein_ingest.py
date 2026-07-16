from elasticsearch import Elasticsearch
from elasticsearch.helpers import parallel_bulk
from elasticsearch.exceptions import NotFoundError
from dotenv import load_dotenv
import os
import json
import pandas as pd
from typing import Dict, Any, List
import datetime
import warnings

# Suppress InsecureRequestWarning
warnings.filterwarnings('ignore', message='Unverified HTTPS request')

# Load environment variables
load_dotenv('variables.env')

# Elasticsearch configuration
ES_URL = os.getenv('ES_URL')
ES_API_KEY = os.getenv('ES_API_KEY')
ELSER_INFERENCE_ID = os.getenv('ELSER_INFERENCE_ID', '.elser-2-elasticsearch')
# Jina on Elastic Inference Service (EIS) — available by default on Elastic Cloud
EMBEDDING_INFERENCE_ID = os.getenv('EMBEDDING_INFERENCE_ID', 'jina-embeddings-v3')
JINA_MODEL_ID = os.getenv('JINA_MODEL_ID', 'jina-embeddings-v3')
E5_INFERENCE_ID = os.getenv('E5_INFERENCE_ID', '.multilingual-e5-small-elasticsearch')

# Bulk ingestion configuration
INGEST_BULK_SIZE = int(os.getenv('INGEST_BULK_SIZE', '200'))
INGEST_THREAD_COUNT = int(os.getenv('INGEST_THREAD_COUNT', '4'))
INGEST_QUEUE_SIZE = int(os.getenv('INGEST_QUEUE_SIZE', '1000'))
ES_REQUEST_TIMEOUT = int(os.getenv('ES_REQUEST_TIMEOUT', '300'))

# Initialize Elasticsearch client
es = Elasticsearch(
    ES_URL,
    api_key=ES_API_KEY,
    verify_certs=False,
    request_timeout=ES_REQUEST_TIMEOUT
)

# Index name comes from ingest.py via _INGEST_INDEX (not variables.env).
PLATFORM = 'shein'
DEFAULT_INDEX_NAME = 'ecommerce_shein_products'
INDEX_NAME = os.environ.get('_INGEST_INDEX') or DEFAULT_INDEX_NAME
CSV_FILENAME = 'shein-products.csv'

def ensure_embedding_inference_endpoint() -> None:
    """Ensure the Jina EIS embedding endpoint exists (create if missing)."""
    inference_id = EMBEDDING_INFERENCE_ID or 'jina-embeddings-v3'
    print(f"\n🧠 Checking embedding inference endpoint: {inference_id}")
    try:
        es.inference.get(inference_id=inference_id)
        print(f"✓ Inference endpoint already exists: {inference_id}")
        return
    except NotFoundError:
        pass
    except Exception as e:
        if "404" not in str(e) and "not_found" not in str(e).lower():
            print(f"⚠️  Could not GET inference endpoint ({e}); attempting create...")

    print(f"📝 Creating Jina EIS endpoint: {inference_id} (model={JINA_MODEL_ID})")
    body = {
        "service": "elastic",
        "service_settings": {"model_id": JINA_MODEL_ID},
    }
    try:
        es.inference.put(
            task_type="text_embedding",
            inference_id=inference_id,
            inference_config=body,
        )
    except TypeError:
        # Older elasticsearch-py uses body= instead of inference_config=
        es.inference.put(
            task_type="text_embedding",
            inference_id=inference_id,
            body=body,
        )
    print(f"✅ Created inference endpoint: {inference_id}")


def load_mapping_from_file(mapping_file_path: str) -> Dict[str, Any]:
    """Load mapping from JSON file and replace inference ID placeholders with environment variables."""
    with open(mapping_file_path, 'r') as f:
        mapping_content = f.read()
    
    # Replace inference ID placeholders with actual environment variables
    mapping_content = mapping_content.replace('${EMBEDDING_INFERENCE_ID}', EMBEDDING_INFERENCE_ID or '')
    
    return json.loads(mapping_content)

def create_index_with_mapping(index_name: str, mapping_config: Dict[str, Any]):
    """Delete the index if it exists, then create it with the given mapping."""
    print(f"\n{'='*60}")
    print(f"Setting up index: {index_name}")
    print(f"{'='*60}")

    exists = bool(es.indices.exists(index=index_name))
    if exists:
        print(f"🗑️  Index exists — deleting: {index_name}")
        es.indices.delete(index=index_name)
        for _ in range(30):
            if not bool(es.indices.exists(index=index_name)):
                break
        print(f"✓ Deleted index: {index_name}")
    else:
        print(f"ℹ️  Index does not exist yet: {index_name}")

    print(f"📝 Creating index: {index_name}")
    create_kwargs: Dict[str, Any] = {"index": index_name}
    if "mappings" in mapping_config:
        create_kwargs["mappings"] = mapping_config["mappings"]
    if "settings" in mapping_config:
        create_kwargs["settings"] = mapping_config["settings"]
    try:
        es.indices.create(**create_kwargs)
    except TypeError:
        es.indices.create(index=index_name, body=mapping_config)
    print(f"✅ Created index: {index_name}")

def process_csv_file(csv_file_path: str) -> List[Dict[str, Any]]:
    """Process the Shein CSV file and return a list of documents."""
    print(f"\n📂 Processing SHEIN CSV file...")
    print(f"   File path: {csv_file_path}")
    
    # Check if file exists
    if not os.path.exists(csv_file_path):
        print(f"❌ File not found: {csv_file_path}")
        return []
    
    print(f"📖 Reading CSV file...")
    # Read CSV file
    df = pd.read_csv(csv_file_path)
    print(f"✓ CSV file loaded successfully")
    print(f"   Columns: {len(df.columns)}")
    print(f"   Rows: {len(df)}")
    
    print(f"🔄 Converting to documents...")
    # Convert DataFrame to list of dictionaries
    documents = df.to_dict('records')
    
    print(f"⏰ Adding timestamps...")
    # Add timestamp to each document
    current_timestamp = datetime.datetime.now().isoformat()
    for doc in documents:
        doc['timestamp'] = current_timestamp
    
    print(f"✅ Successfully processed {len(documents)} documents from Shein")
    return documents

def clean_document(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Clean and prepare document for indexing."""
    cleaned_doc = {}
    
    for key, value in doc.items():
        # Handle NaN values
        if pd.isna(value):
            continue
        
        # Convert string representations of lists/objects to proper types
        if isinstance(value, str):
            # Try to parse JSON-like strings
            if value.startswith('[') and value.endswith(']'):
                try:
                    value = json.loads(value)
                except:
                    pass
            elif value.startswith('{') and value.endswith('}'):
                try:
                    value = json.loads(value)
                except:
                    pass
        
        # Handle numeric values
        if isinstance(value, str):
            # Try to convert to float if it looks like a number
            if value.replace('.', '').replace('-', '').isdigit():
                try:
                    value = float(value)
                except:
                    pass
        
        cleaned_doc[key] = value
    
    return cleaned_doc

def ingest_documents_to_index(index_name: str, documents: List[Dict[str, Any]], chunk_size: int = None):
    """Ingest documents to Elasticsearch index using parallel bulk."""
    # Use environment variable if chunk_size not provided
    if chunk_size is None:
        chunk_size = INGEST_BULK_SIZE
    
    print(f"\n🚀 Starting ingestion to {index_name}")
    print(f"   Total documents: {len(documents)}")
    print(f"   Chunk size: {chunk_size}")
    print(f"   Thread count: {INGEST_THREAD_COUNT}")
    print(f"   Queue size: {INGEST_QUEUE_SIZE}")
    
    print(f"🧹 Cleaning and preparing documents...")
    # Prepare actions for bulk indexing
    actions = []
    for i, doc in enumerate(documents):
        if i % 1000 == 0 and i > 0:
            print(f"   Processed {i}/{len(documents)} documents...")
        cleaned_doc = clean_document(doc)
        actions.append({
            '_index': index_name,
            '_source': cleaned_doc
        })
    
    print(f"✅ Document preparation completed")
    print(f"📤 Starting bulk ingestion...")
    
    # Use parallel bulk helper
    success_count = 0
    error_count = 0
    total_processed = 0
    
    for success, info in parallel_bulk(
        es,
        actions,
        chunk_size=chunk_size,
        thread_count=INGEST_THREAD_COUNT,
        queue_size=INGEST_QUEUE_SIZE
    ):
        total_processed += 1
        if total_processed % 100 == 0:
            print(f"   Progress: {total_processed}/{len(actions)} documents processed...")
        
        if not success:
            print(f"❌ Error indexing document: {info}")
            error_count += 1
            # Print first few errors in detail
            if error_count <= 3:
                print(f"   Detailed error: {info}")
        else:
            success_count += 1
    
    print(f"\n🎉 Ingestion completed for {index_name}")
    print(f"   ✅ Successful: {success_count}")
    print(f"   ❌ Errors: {error_count}")
    if success_count + error_count > 0:
        print(f"   📊 Success rate: {(success_count/(success_count+error_count)*100):.1f}%")
    
    return success_count, error_count

def main():
    """Main function to process Shein CSV file and ingest into Elasticsearch."""
    print("="*80)
    print("🛒 SHEIN PRODUCTS INGESTION TO ELASTICSEARCH")
    print("="*80)
    print(f"⏰ Started at: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Test Elasticsearch connection
    print(f"\n🔌 Testing Elasticsearch connection...")
    try:
        cluster_info = es.info()
        print(f"✅ Connected to Elasticsearch cluster: {cluster_info['cluster_name']}")
        print(f"   Version: {cluster_info['version']['number']}")
        print(f"   URL: {ES_URL}")
    except Exception as e:
        print(f"❌ Failed to connect to Elasticsearch: {str(e)}")
        print(f"   Please check your connection settings in variables.env")
        return
    
    # Load mapping configuration
    mappings_dir = os.path.join(os.path.dirname(__file__), 'mappings')
    mapping_file_path = os.path.join(mappings_dir, 'shein_mapping.json')
    
    if not os.path.exists(mapping_file_path):
        print(f"❌ Mapping file not found: {mapping_file_path}")
        return
    
    print(f"\n📄 Loading mapping configuration for Shein...")
    try:
        mapping_config = load_mapping_from_file(mapping_file_path)
        print(f"✅ Mapping configuration loaded")
        print(f"   semantic_text inference_id: {EMBEDDING_INFERENCE_ID}")
    except Exception as e:
        print(f"❌ Failed to load mapping configuration: {str(e)}")
        return

    try:
        ensure_embedding_inference_endpoint()
    except Exception as e:
        print(f"❌ Failed to ensure embedding inference endpoint: {e}")
        print("   Confirm your Elastic Cloud project supports EIS Jina models.")
        return
    
    # Create index with mapping
    print(f"\n{'='*80}")
    print(f"🛍️  PROCESSING SHEIN PRODUCTS")
    print(f"{'='*80}")
    create_index_with_mapping(INDEX_NAME, mapping_config)
    
    # Process CSV file
    csv_file_path = os.path.join(os.path.dirname(__file__), '..', CSV_FILENAME)
    documents = process_csv_file(csv_file_path)
    
    if not documents:
        print(f"⚠️  No documents found in {CSV_FILENAME}")
        return
    
    # Ingest documents
    try:
        success_count, error_count = ingest_documents_to_index(INDEX_NAME, documents)
        
        print(f"\n{'='*80}")
        print(f"📊 INGESTION SUMMARY")
        print(f"{'='*80}")
        print(f"⏰ Completed at: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"📄 Documents ingested: {success_count}")
        print(f"❌ Errors: {error_count}")
        if success_count + error_count > 0:
            print(f"📈 Success rate: {((success_count/(success_count+error_count))*100):.1f}%")
        print(f"✅ Ingestion completed!")
        print(f"{'='*80}")
    except Exception as e:
        print(f"❌ Error during ingestion: {str(e)}")
        raise

if __name__ == '__main__':
    main()
