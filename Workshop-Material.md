
# Lab Information

## Lab Location

**Instruqt Lab:** [https://play.instruqt.com/elastic/tracks/dell-aidp-demo-day/](https://play.instruqt.com/elastic/tracks/dell-aidp-demo-day/)

> ⚠️ Lab environments auto-terminate after **180 minutes**. Script your builds (data load, vectorization, app setup) so you can spin back up and be demo-ready in under 10 minutes.

## Data Sets

You can build your Capstone project on one of the provided datasets, or bring your own.

- **Bring your own** — any dataset of your choice is welcome
## Or use one of these 2 below
- **E-commerce** — https://github.com/luminati-io/eCommerce-dataset-samples
- **Find a Physician** — https://github.com/bommas/Dell-AIDP-DDSE-Workshop/blob/main/NH_ProviderInfo_Jun2026.csv

Build your own Elastic-powered demo, end to end, using a lab environment. Full creative authority — pick dataset, story, and UI. Goal: leave with a repeatable demo you can run live, day-of, in minutes.

## Before you start

Complete the training first: **https://ela.st/dell-warriors**

Don't skip this — it covers the concepts (vector search, hybrid search, RAG) you'll need to make good choices below.

## Your lab environment — read this first

- Environment auto-terminates after **180 minutes**. It is not long-running.
- Nothing you build here survives past that window unless you save it (code, configs, notes) outside the env.
- **Design for repeatability from the start.** Script your ingest (Python + bulk helper, ingest pipeline as JSON/API calls), don't hand-build indices by clicking around Kibana. On workshop day, you should be able to run one script and be demo-ready in minutes — not rebuild from memory.
- Treat every step as something you'll re-run: idempotent index creation, idempotent pipeline creation, a single ingest command.

## Step 1 — Choose your dataset

Any dataset works. Two examples Sunile and Satish have used, listed in `datasets.txt`:

- **E-commerce** — https://github.com/luminati-io/eCommerce-dataset-samples
- **Find a Physician** — https://github.com/bommas/Dell-AIDP-DDSE-Workshop/blob/main/NH_ProviderInfo_Jun2026.csv

Pick something with a story: a search problem a lexical-only or vector-only engine handles badly, that hybrid search / filters / geo fixes well.

## Step 2 — Build the ingest pipeline

Elasticsearch can transform data on the way in — no external ETL tool required. This is done with **ingest pipelines**:

- Docs: https://www.elastic.co/docs/manage-data/ingest/transform-enrich/ingest-pipelines

Build the pipeline either through the Kibana UI or the API — API is preferred for repeatability (save it as a script/JSON you can replay).

## Step 3 — Ingest your data

Elasticsearch is a drop-in for most search backends and has strong client support across languages. Sunile and Satish typically use **Python**.

Use the `elasticsearch-py` **bulk helpers** for ingest — much faster and more reliable than single-document indexing:

- https://elasticsearch-py.readthedocs.io/en/v8.2.2/helpers.html#bulk-helpers

Write this as a script. On demo day you want: run script → data indexed → ready to show.

## Step 4 — Design your search experience

Elasticsearch is your vector search database. Use it deliberately to tell a story:

- **Vector search** — semantic/similarity search on your dataset.
- **Lexical search** — use it *deliberately alongside* vector search to highlight what pure vector search misses (exact term matches, IDs, codes, rare keywords). The contrast is the point — show both, show where each wins.
- **Filters** — structured/exact-match constraints (category, price range, status, etc.) layered on top of search.
- **Geosearch** — if your dataset has location data, use geo queries (distance, bounding box, polygon) to add another dimension to the demo.

Learn ES|QL for querying, aggregating, and exploring your data:

- https://www.elastic.co/docs/reference/query-languages/esql
- https://www.elastic.co/docs/reference/query-languages/esql/esql-syntax-reference

## Step 5 — Choose your UI

Up to you how you show this off. Options:

- **Agent Builder** — Elastic's built-in agent framework.
- **Custom UI** connected via **MCP** or **A2A** — both endpoints are provided out-of-the-box by Elastic.
- **Chatbot** using **Chainlit** with LLM inference wired to your Elasticsearch backend.
- Anything else that tells your story well — tools and skills are fair game.

## Step 6 — Present your demo (10 min)

Each demo runs **10 minutes**. Structure it as:

1. **What & why** — what you built, why you chose this dataset/story.
2. **Show the demo** — run it live.
3. **What you used in Elastic** — vector search, lexical search, filters, geosearch, ES|QL, ingest pipelines, UI/agent approach — whatever applied.
4. **Reflection** — what you liked about the experience, what surprised you, what you want to learn next.

## Deliverables checklist

Before your 180-minute session ends, make sure you've saved (outside the env) everything needed to reproduce the demo from scratch:

- [ ] Ingest pipeline definition (JSON/API script)
- [ ] Index mapping / creation script
- [ ] Ingest script (Python, bulk helper)
- [ ] Example queries: vector, lexical, hybrid, filtered, geo (as applicable)
- [ ] UI/agent config or code
- [ ] A short script/story: what problem you're demoing, what to click, what to say

## Day-of-workshop goal

Kick off ingest → wait for it to finish → demo is ready. No manual rebuilding, no guessing what you did last time.

Ingest Pipelines  - Getting to know more
===

A simple example: create a pipeline in **Kibana → Dev Tools**
![Jul-06-2026_at_01.10.30-image.png](https://play.instruqt.com/assets/tracks/aff1fwkus2ko/6a0d0c1965f1c67be8a78cb35c6267ec/assets/Jul-06-2026_at_01.10.30-image.png)


```
PUT _ingest/pipeline/my-pipeline
{
  "description": "lowercase the category field",
  "processors": [
    {
      "lowercase": {
        "field": "category"
      }
    }
  ]
}
```

### Option 1 — force a pipeline to run at ingest time

Pass `pipeline=my-pipeline` as a query param on the index request. Docs only run through it on that call, not automatically going forward.

Python example (bulk helper, per-call pipeline):

```python
from elasticsearch import Elasticsearch, helpers

es = Elasticsearch("http://localhost:9200", api_key="<your_api_key>")

actions = [
    {"_index": "products", "_source": {"category": "SHOES", "name": "Trail Runner"}},
    {"_index": "products", "_source": {"category": "APPAREL", "name": "Rain Jacket"}},
]

helpers.bulk(es, actions, pipeline="my-pipeline")
```

### Option 2 — attach pipeline to the index as default

Set `index.default_pipeline` on the index. Every doc indexed into it — bulk, single doc, any client — runs through the pipeline automatically. No `pipeline` param needed per call.

```
PUT products/_settings
{
  "index.default_pipeline": "my-pipeline"
}
```

Or set it at index creation time:

```
PUT products
{
  "settings": {
    "index.default_pipeline": "my-pipeline"
  }
}
```

With the default pipeline set, this plain bulk call (no `pipeline` arg) still runs every doc through `my-pipeline`:

```python
helpers.bulk(es, actions)
```

API Keys
===

Create an API key in Kibana (Stack Management → API Keys) to cover ingest and MCP/A2A connections. Example below is wide open (`cluster: manage/all`, `indices: *`, `applications: *`) — fine for a throwaway demo env, **not** a least-privilege pattern, don't reuse in production:

```json
{
  "write-only-role": {
    "cluster": [
      "manage",
      "all"
    ],
    "indices": [
      {
        "names": [
          "*"
        ],
        "privileges": [
          "write",
          "read",
          "view_index_metadata",
          "manage",
          "all"
        ],
        "allow_restricted_indices": false
      }
    ],
    "applications": [
      {
        "application": "kibana-.kibana",
        "privileges": [
          "*"
        ],
        "resources": [
          "*"
        ]
      }
    ],
    "run_as": [],
    "metadata": {},
    "transient_metadata": {
      "enabled": true
    }
  }
}
```

For production usage, narrow `cluster`, `indices.names`, `indices.privileges`, and `applications.privileges` down to exactly what's needed — this example trades security for demo convenience.
