# ElasticDataSets — Elastic Cloud Data Ingest

Load sample datasets into **Elastic Cloud** (Serverless or Elastic Cloud Hosted) using the same ingest pattern as [eCommerce-dataset-samples](https://github.com/sunilemanjee/eCommerce-dataset-samples): `variables.env` + `ingest/mappings/` + `parallel_bulk`.

Embeddings use **Jina** via Elastic Inference Service (EIS) on Elastic Cloud (default: `jina-embeddings-v3`). No Jina API key or ML-node deploy is required — see [EIS](https://www.elastic.co/docs/explore-analyze/elastic-inference/eis) and [Jina models](https://www.elastic.co/docs/explore-analyze/machine-learning/nlp/ml-nlp-jina).

This repo includes **two ingest scripts** (also runnable via `python ingest.py`):

| Wrapper arg | Script | CSV | Index |
|---|---|---|---|
| `providers` | `ingest/nursing_providers_ingest.py` | `NH_ProviderInfo_Jun2026.csv` | `nursing-providers` |
| `ecommerce` | `ingest/shein_ingest.py` | `shein-products.csv` | `ecommerce_shein_products` |

Both scripts share Elastic Cloud credentials and bulk settings in `variables.env`.

## Datasets

### Nursing providers (`NH_ProviderInfo_Jun2026.csv`)

| Property | Value |
|---|---|
| Rows | 28,000 |
| Specialties | 61 (including eye care) |
| Custom ratings | Patient Experience, Care Quality, Staff Responsiveness, Facility Cleanliness, Communication |
| Semantic fields | `medical_specialty_semantic`, `provider_name_semantic` |

### Shein products (`shein-products.csv`)

Copied from [eCommerce-dataset-samples](https://github.com/sunilemanjee/eCommerce-dataset-samples).

| Property | Value |
|---|---|
| Rows | ~1,000 |
| Key fields | `product_name`, `description`, `initial_price`, `final_price`, `brand`, `category`, `rating` |
| Semantic fields | `product_name_semantic`, `description_semantic` |

## Project structure

```
ElasticDataSets/
├── NH_ProviderInfo_Jun2026.csv
├── shein-products.csv
├── variables.env.template
├── setup_env.sh
├── ingest.py                            # Wrapper: providers | ecommerce
├── requirements.txt
├── ingest/
│   ├── nursing_providers_ingest.py
│   ├── shein_ingest.py
│   └── mappings/
│       ├── nursing_providers_mapping.json
│       └── shein_mapping.json
```

## Prerequisites

- Python 3.10+
- Elastic Cloud project (Serverless **or** Elastic Cloud Hosted)
- Elastic Cloud API key with index write + inference privileges

## Setup

### 1. Configure Elastic Cloud credentials

```bash
cp variables.env.template variables.env
```

Fill in:

| Variable | Required | Description |
|---|---|---|
| `ES_URL` | Yes | Elastic Cloud URL |
| `ES_API_KEY` | Yes | Elastic Cloud API key |

Defaults already set for Elastic Cloud inference:

| Variable | Default |
|---|---|
| `EMBEDDING_INFERENCE_ID` | `jina-embeddings-v3` (Jina on EIS) |
| `JINA_MODEL_ID` | `jina-embeddings-v3` |
| `E5_INFERENCE_ID` | `.multilingual-e5-small-elasticsearch` |
| `ELSER_INFERENCE_ID` | `.elser-2-elasticsearch` |
| `INGEST_BULK_SIZE` | `200` |
| `INGEST_THREAD_COUNT` | `4` |
| `INGEST_QUEUE_SIZE` | `1000` |
| `ES_REQUEST_TIMEOUT` | `300` |

Index name is **not** set in `variables.env`. `ingest.py` picks it from the dataset argument:
`providers` → `nursing-providers`, `ecommerce` → `ecommerce_shein_products`.

### 2. Install dependencies

```bash
chmod +x setup_env.sh
./setup_env.sh
source venv/bin/activate
```

---

## Ingest script 1 — Nursing providers

**Script:** `ingest/nursing_providers_ingest.py`  
**CSV:** `NH_ProviderInfo_Jun2026.csv`  
**Index:** `nursing-providers`  
**Mapping:** `ingest/mappings/nursing_providers_mapping.json`

### Run

```bash
source venv/bin/activate
python ingest.py providers
# or: python ingest/nursing_providers_ingest.py
```

### What it does

1. Connects to Elastic Cloud with `ES_URL` + `ES_API_KEY`
2. Ensures the Jina EIS inference endpoint exists (`jina-embeddings-v3`)
3. Loads the nursing mapping and substitutes `${EMBEDDING_INFERENCE_ID}`
4. Deletes the target index if it exists, then recreates it with the mapping
5. Transforms CMS CSV columns to snake_case fields
6. Bulk indexes with `elasticsearch.helpers.parallel_bulk`  
   (`semantic_text` embeddings are generated via Jina on EIS)

### Example search

```json
POST nursing-providers/_search
{
  "query": {
    "semantic": {
      "field": "medical_specialty_semantic",
      "query": "eye care and vision problems"
    }
  },
  "_source": ["provider_name", "medical_specialty", "city", "state", "avg_patient_rating"]
}
```

---

## Ingest script 2 — Shein products

**Script:** `ingest/shein_ingest.py`  
**CSV:** `shein-products.csv`  
**Index:** `ecommerce_shein_products`  
**Mapping:** `ingest/mappings/shein_mapping.json`

From [shein_ingest.py](https://github.com/sunilemanjee/eCommerce-dataset-samples/blob/main/ingest/shein_ingest.py).

### Run

```bash
source venv/bin/activate
python ingest.py ecommerce
# or: python ingest/shein_ingest.py
```

### What it does

1. Connects to Elastic Cloud
2. Ensures the Jina EIS inference endpoint exists
3. Loads Shein mapping with `${EMBEDDING_INFERENCE_ID}`
4. Deletes the target index if it exists, then recreates it with the mapping
5. Reads and cleans `shein-products.csv`
6. Bulk indexes with `parallel_bulk`

### Example search

```json
POST ecommerce_shein_products/_search
{
  "query": {
    "semantic": {
      "field": "product_name_semantic",
      "query": "tall bathroom storage cabinet"
    }
  },
  "_source": ["product_name", "brand", "final_price", "currency", "rating"]
}
```

---

## Quick reference

```bash
cp variables.env.template variables.env   # set ES_URL + ES_API_KEY
./setup_env.sh
source venv/bin/activate

# Wrapper — index name comes from the argument (nothing to set in variables.env)
python ingest.py providers     # → nursing-providers (delete/recreate + ingest)
python ingest.py ecommerce     # → ecommerce_shein_products (delete/recreate + ingest)
python ingest.py providers --index my-custom-index   # optional override for one run
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `ES_URL and ES_API_KEY must be set` | Fill `variables.env` |
| Cannot connect | Check Elastic Cloud URL / API key |
| Inference / `semantic_text` errors | Confirm `EMBEDDING_INFERENCE_ID` is `jina-embeddings-v3` and EIS is available on your project |
| CSV not found | Run from project root `ElasticDataSets/` |
| Slow / timeouts | Raise `ES_REQUEST_TIMEOUT`, lower `INGEST_BULK_SIZE` |

## Security

Do **not** commit `variables.env` or `.env` — both are gitignored.
