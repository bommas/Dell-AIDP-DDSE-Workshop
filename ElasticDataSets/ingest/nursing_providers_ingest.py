#!/usr/bin/env python3
"""
Nursing home provider CSV ingest to Elastic Cloud.

Structure modeled after:
https://github.com/sunilemanjee/eCommerce-dataset-samples/blob/main/ingest/shein_ingest.py

Usage:
  cp variables.env.template variables.env   # fill ES_URL + ES_API_KEY
  ./setup_env.sh
  source venv/bin/activate
  python ingest/nursing_providers_ingest.py

Uses Jina embeddings via Elastic Inference Service (EIS)
(default inference_id: jina-embeddings-v3). No Jina API key needed.
"""

from __future__ import annotations

import datetime
import json
import os
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from elasticsearch.helpers import parallel_bulk
from elasticsearch.exceptions import NotFoundError

# Suppress InsecureRequestWarning
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

ROOT = Path(__file__).resolve().parent.parent

# Load environment variables (same pattern as eCommerce repo)
load_dotenv(ROOT / "variables.env")
load_dotenv(ROOT / ".env")

# Elasticsearch configuration — Elastic Cloud Serverless / ECH
ES_URL = os.getenv("ES_URL")
ES_API_KEY = os.getenv("ES_API_KEY")
# Jina on EIS (Elastic Cloud) — available by default, no external API key
DEFAULT_EMBEDDING_INFERENCE_ID = "jina-embeddings-v3"
DEFAULT_JINA_MODEL_ID = "jina-embeddings-v3"
EMBEDDING_INFERENCE_ID = os.getenv("EMBEDDING_INFERENCE_ID", DEFAULT_EMBEDDING_INFERENCE_ID)
JINA_MODEL_ID = os.getenv("JINA_MODEL_ID", DEFAULT_JINA_MODEL_ID)

# Bulk ingestion configuration
INGEST_BULK_SIZE = int(os.getenv("INGEST_BULK_SIZE", "200"))
INGEST_THREAD_COUNT = int(os.getenv("INGEST_THREAD_COUNT", "4"))
INGEST_QUEUE_SIZE = int(os.getenv("INGEST_QUEUE_SIZE", "1000"))
ES_REQUEST_TIMEOUT = int(os.getenv("ES_REQUEST_TIMEOUT", "300"))

# Platform / dataset configuration
# Index name comes from ingest.py via _INGEST_INDEX (not variables.env).
DEFAULT_INDEX_NAME = "nursing-providers"
INDEX_NAME = os.environ.get("_INGEST_INDEX") or DEFAULT_INDEX_NAME
CSV_FILENAME = "NH_ProviderInfo_Jun2026.csv"

# CSV column -> Elasticsearch field
FIELD_MAP: Dict[str, str] = {
    "CMS Certification Number (CCN)": "ccn",
    "Provider Name": "provider_name",
    "Provider Address": "provider_address",
    "City/Town": "city",
    "State": "state",
    "ZIP Code": "zip_code",
    "Telephone Number": "telephone",
    "County/Parish": "county",
    "Urban": "urban",
    "Ownership Type": "ownership_type",
    "Number of Certified Beds": "certified_beds",
    "Average Number of Residents per Day": "avg_residents_per_day",
    "Provider Type": "provider_type",
    "Chain Name": "chain_name",
    "Date First Approved to Provide Medicare and Medicaid Services": "approved_date",
    "Overall Rating": "overall_rating",
    "Health Inspection Rating": "health_inspection_rating",
    "Staffing Rating": "staffing_rating",
    "QM Rating": "qm_rating",
    "Reported Total Nurse Staffing Hours per Resident per Day": "nurse_staffing_hours_per_resident",
    "Total nursing staff turnover": "nursing_staff_turnover_pct",
    "Total Amount of Fines in Dollars": "total_fines_usd",
    "Total Number of Penalties": "total_penalties",
    "Location": "location_text",
    "Latitude": "latitude",
    "Longitude": "longitude",
    "Processing Date": "processing_date",
    "Rating Cycle 1 Standard Survey Health Date": "last_health_inspection_date",
    "Medical Specialty": "medical_specialty",
    "Patient Experience Rating": "patient_experience_rating",
    "Care Quality Rating": "care_quality_rating",
    "Staff Responsiveness Rating": "staff_responsiveness_rating",
    "Facility Cleanliness Rating": "facility_cleanliness_rating",
    "Communication Rating": "communication_rating",
}

FLOAT_FIELDS = {
    "avg_residents_per_day",
    "overall_rating",
    "health_inspection_rating",
    "staffing_rating",
    "qm_rating",
    "patient_experience_rating",
    "care_quality_rating",
    "staff_responsiveness_rating",
    "facility_cleanliness_rating",
    "communication_rating",
    "total_fines_usd",
    "nurse_staffing_hours_per_resident",
    "nursing_staff_turnover_pct",
}

INT_FIELDS = {
    "certified_beds",
    "total_penalties",
}

# Initialize Elasticsearch client
es = Elasticsearch(
    ES_URL,
    api_key=ES_API_KEY,
    verify_certs=True,
    request_timeout=ES_REQUEST_TIMEOUT,
)


def ensure_embedding_inference_endpoint() -> None:
    """Ensure the Jina EIS embedding endpoint exists (create if missing).

    On Elastic Cloud, Jina models are served via Elastic Inference Service
    (`service: elastic`). No Jina API key is required.
    """
    inference_id = EMBEDDING_INFERENCE_ID or DEFAULT_EMBEDDING_INFERENCE_ID
    print(f"\n🧠 Checking embedding inference endpoint: {inference_id}")
    try:
        es.inference.get(inference_id=inference_id)
        print(f"✓ Inference endpoint already exists: {inference_id}")
        return
    except NotFoundError:
        pass
    except Exception as e:
        # Older clients / transient errors — try create anyway if clearly missing
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
    """Load mapping from JSON and replace inference ID placeholders from env."""
    with open(mapping_file_path, "r", encoding="utf-8") as f:
        mapping_content = f.read()

    mapping_content = mapping_content.replace(
        "${EMBEDDING_INFERENCE_ID}", EMBEDDING_INFERENCE_ID or ""
    )
    return json.loads(mapping_content)


def create_index_with_mapping(index_name: str, mapping_config: Dict[str, Any]) -> None:
    """Delete the index if it exists, then create it with the given mapping."""
    print(f"\n{'=' * 60}")
    print(f"Setting up index: {index_name}")
    print(f"{'=' * 60}")

    exists = bool(es.indices.exists(index=index_name))
    if exists:
        print(f"🗑️  Index exists — deleting: {index_name}")
        es.indices.delete(index=index_name)
        # Confirm removal before recreate (Serverless / async delete)
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
    # Fall back for older clients / full body payloads
    try:
        es.indices.create(**create_kwargs)
    except TypeError:
        es.indices.create(index=index_name, body=mapping_config)
    print(f"✅ Created index: {index_name}")


def _to_float(value: Any) -> Optional[float]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> Optional[int]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def transform_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Map CMS CSV columns to lean Elasticsearch document fields."""
    doc: Dict[str, Any] = {}

    for csv_col, es_field in FIELD_MAP.items():
        if csv_col not in row:
            continue
        value = row[csv_col]
        if pd.isna(value):
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        doc[es_field] = value

    # Coerce types
    for field in FLOAT_FIELDS:
        if field in doc:
            coerced = _to_float(doc[field])
            if coerced is None:
                doc.pop(field, None)
            else:
                doc[field] = coerced

    for field in INT_FIELDS:
        if field in doc:
            coerced = _to_int(doc[field])
            if coerced is None:
                doc.pop(field, None)
            else:
                doc[field] = coerced

    # Urban Y/N -> boolean
    if "urban" in doc:
        urban = str(doc["urban"]).upper()
        if urban == "Y":
            doc["urban"] = True
        elif urban == "N":
            doc["urban"] = False
        else:
            doc.pop("urban", None)

    # geo_point from lat/lon
    lat = _to_float(doc.pop("latitude", None))
    lon = _to_float(doc.pop("longitude", None))
    if lat is not None and lon is not None:
        doc["location"] = {"lat": lat, "lon": lon}

    # Average of custom patient-facing ratings
    rating_fields = [
        "patient_experience_rating",
        "care_quality_rating",
        "staff_responsiveness_rating",
        "facility_cleanliness_rating",
        "communication_rating",
    ]
    ratings = [doc[f] for f in rating_fields if f in doc and doc[f] is not None]
    if ratings:
        doc["avg_patient_rating"] = round(sum(ratings) / len(ratings), 2)

    # Synthetic rows created during dataset expansion (CCN starts with 9)
    ccn = doc.get("ccn")
    if ccn is not None:
        doc["is_synthetic"] = str(ccn).startswith("9")

    return doc


def process_csv_file(csv_file_path: str) -> List[Dict[str, Any]]:
    """Process the nursing provider CSV and return documents."""
    print("\n📂 Processing nursing provider CSV file...")
    print(f"   File path: {csv_file_path}")

    if not os.path.exists(csv_file_path):
        print(f"❌ File not found: {csv_file_path}")
        return []

    print("📖 Reading CSV file...")
    df = pd.read_csv(csv_file_path, dtype=str, keep_default_na=False)
    print("✓ CSV file loaded successfully")
    print(f"   Columns: {len(df.columns)}")
    print(f"   Rows: {len(df)}")

    print("🔄 Converting and transforming documents...")
    current_timestamp = datetime.datetime.now().isoformat()
    documents: List[Dict[str, Any]] = []

    for i, row in enumerate(df.to_dict("records")):
        if i % 5000 == 0 and i > 0:
            print(f"   Transformed {i}/{len(df)} rows...")
        doc = transform_row(row)
        if not doc.get("ccn"):
            continue
        doc["timestamp"] = current_timestamp
        documents.append(doc)

    print(f"✅ Successfully processed {len(documents)} documents")
    return documents


def clean_document(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Clean and prepare document for indexing (drop NaNs / empty values)."""
    cleaned_doc: Dict[str, Any] = {}

    for key, value in doc.items():
        if pd.isna(value) if not isinstance(value, (dict, list)) else False:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        cleaned_doc[key] = value

    return cleaned_doc


def ingest_documents_to_index(
    index_name: str,
    documents: List[Dict[str, Any]],
    chunk_size: int | None = None,
) -> tuple[int, int]:
    """Ingest documents using parallel_bulk."""
    if chunk_size is None:
        chunk_size = INGEST_BULK_SIZE

    print(f"\n🚀 Starting ingestion to {index_name}")
    print(f"   Total documents: {len(documents)}")
    print(f"   Chunk size: {chunk_size}")
    print(f"   Thread count: {INGEST_THREAD_COUNT}")
    print(f"   Queue size: {INGEST_QUEUE_SIZE}")
    print(f"   Embedding inference ID: {EMBEDDING_INFERENCE_ID}")

    print("🧹 Cleaning and preparing documents...")
    actions = []
    for i, doc in enumerate(documents):
        if i % 1000 == 0 and i > 0:
            print(f"   Prepared {i}/{len(documents)} documents...")
        cleaned_doc = clean_document(doc)
        actions.append(
            {
                "_index": index_name,
                "_id": cleaned_doc.get("ccn"),
                "_source": cleaned_doc,
            }
        )

    print("✅ Document preparation completed")
    print("📤 Starting bulk ingestion...")

    success_count = 0
    error_count = 0
    total_processed = 0

    for success, info in parallel_bulk(
        es,
        actions,
        chunk_size=chunk_size,
        thread_count=INGEST_THREAD_COUNT,
        queue_size=INGEST_QUEUE_SIZE,
        request_timeout=ES_REQUEST_TIMEOUT,
    ):
        total_processed += 1
        if total_processed % 100 == 0:
            print(f"   Progress: {total_processed}/{len(actions)} documents processed...")

        if not success:
            print(f"❌ Error indexing document: {info}")
            error_count += 1
            if error_count <= 3:
                print(f"   Detailed error: {info}")
        else:
            success_count += 1

    print(f"\n🎉 Ingestion completed for {index_name}")
    print(f"   ✅ Successful: {success_count}")
    print(f"   ❌ Errors: {error_count}")
    if success_count + error_count > 0:
        print(f"   📊 Success rate: {(success_count / (success_count + error_count) * 100):.1f}%")

    return success_count, error_count


def main() -> None:
    """Main function to process CSV and ingest into Elastic Cloud."""
    print("=" * 80)
    print("🏥 NURSING PROVIDERS INGESTION TO ELASTICSEARCH")
    print("=" * 80)
    print(f"⏰ Started at: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    if not ES_URL or not ES_API_KEY:
        print("❌ ES_URL and ES_API_KEY must be set in variables.env")
        print("   Copy variables.env.template to variables.env and fill in your Elastic Cloud values.")
        return

    print("\n🔌 Testing Elasticsearch connection...")
    try:
        cluster_info = es.info()
        print(f"✅ Connected to Elasticsearch cluster: {cluster_info['cluster_name']}")
        print(f"   Version: {cluster_info['version']['number']}")
        print(f"   URL: {ES_URL}")
    except Exception as e:
        print(f"❌ Failed to connect to Elasticsearch: {e}")
        print("   Please check ES_URL and ES_API_KEY in variables.env")
        return

    mappings_dir = os.path.join(os.path.dirname(__file__), "mappings")
    mapping_file_path = os.path.join(mappings_dir, "nursing_providers_mapping.json")

    if not os.path.exists(mapping_file_path):
        print(f"❌ Mapping file not found: {mapping_file_path}")
        return

    print("\n📄 Loading mapping configuration...")
    try:
        mapping_config = load_mapping_from_file(mapping_file_path)
        print("✅ Mapping configuration loaded")
        print(f"   semantic_text inference_id: {EMBEDDING_INFERENCE_ID}")
        print("   (Jina on Elastic Inference Service — no Jina API key required)")
    except Exception as e:
        print(f"❌ Failed to load mapping configuration: {e}")
        return

    try:
        ensure_embedding_inference_endpoint()
    except Exception as e:
        print(f"❌ Failed to ensure embedding inference endpoint: {e}")
        print("   Confirm your Elastic Cloud project supports EIS Jina models.")
        return

    print(f"\n{'=' * 80}")
    print("🏥 PROCESSING NURSING PROVIDERS")
    print(f"{'=' * 80}")
    create_index_with_mapping(INDEX_NAME, mapping_config)

    csv_file_path = os.path.join(os.path.dirname(__file__), "..", CSV_FILENAME)
    documents = process_csv_file(csv_file_path)

    if not documents:
        print(f"⚠️  No documents found in {CSV_FILENAME}")
        return

    try:
        success_count, error_count = ingest_documents_to_index(INDEX_NAME, documents)

        print(f"\n{'=' * 80}")
        print("📊 INGESTION SUMMARY")
        print(f"{'=' * 80}")
        print(f"⏰ Completed at: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"📄 Documents ingested: {success_count}")
        print(f"❌ Errors: {error_count}")
        if success_count + error_count > 0:
            print(f"📈 Success rate: {((success_count / (success_count + error_count)) * 100):.1f}%")
        print("✅ Ingestion completed!")
        print(f"{'=' * 80}")
    except Exception as e:
        print(f"❌ Error during ingestion: {e}")
        raise


if __name__ == "__main__":
    main()
