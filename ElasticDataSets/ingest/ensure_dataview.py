"""Create a Kibana data view for an Elasticsearch index (demo helper)."""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request
from typing import Any, Optional


def _kibana_url(es_url: Optional[str] = None, kibana_url: Optional[str] = None) -> Optional[str]:
    kibana_url = kibana_url or os.getenv("KIBANA_URL")
    if kibana_url:
        return kibana_url.rstrip("/")
    es_url = es_url or os.getenv("ES_URL") or ""
    if ".es." in es_url:
        return es_url.replace(".es.", ".kb.", 1).rstrip("/")
    return None


def create_data_view(
    index_pattern: str,
    *,
    name: Optional[str] = None,
    time_field: str = "timestamp",
    es_url: Optional[str] = None,
    kibana_url: Optional[str] = None,
    api_key: Optional[str] = None,
) -> None:
    """Create a Kibana data view object for the index (demo: create only, override if present)."""
    api_key = api_key or os.getenv("ES_API_KEY")
    kibana_url = _kibana_url(es_url=es_url, kibana_url=kibana_url)
    view_name = name or index_pattern

    print(f"\n📝 Creating Kibana data view: {view_name} → {index_pattern}")

    if not api_key or not kibana_url:
        print("⚠️  Missing ES_API_KEY or KIBANA_URL — skipping data view create")
        return

    body = {
        "data_view": {
            "id": index_pattern,
            "title": index_pattern,
            "name": view_name,
            "timeFieldName": time_field,
        },
        "override": True,
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{kibana_url}/api/data_views/data_view",
        data=data,
        headers={
            "Authorization": f"ApiKey {api_key}" if not api_key.lower().startswith("apikey ") else api_key,
            "kbn-xsrf": "true",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as resp:
            payload: dict[str, Any] = json.loads(resp.read().decode("utf-8") or "{}")
            created = payload.get("data_view") or {}
            print(f"✅ Data view ready: {created.get('name', view_name)} ({created.get('title', index_pattern)})")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        print(f"⚠️  Data view create failed (HTTP {e.code}): {detail}")
    except Exception as e:
        print(f"⚠️  Data view create failed: {e}")


# Backwards-compatible name used by ingest scripts
ensure_data_view = create_data_view
