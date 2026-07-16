#!/usr/bin/env python3
"""
Wrapper to run nursing providers or Shein eCommerce ingest.

Usage:
  python ingest.py providers    # creates/recreates nursing-providers and ingests
  python ingest.py ecommerce    # creates/recreates ecommerce_shein_products and ingests

Aliases:
  providers | nursing
  ecommerce | shein | ecom

Index name is chosen from the dataset argument — do not set it in variables.env.
Optional: --index NAME to override the default index for that run.
"""

from __future__ import annotations

import argparse
import os
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INGEST_DIR = ROOT / "ingest"

# dataset alias → (script path, index name)
TARGETS = {
    "providers": (INGEST_DIR / "nursing_providers_ingest.py", "nursing-providers"),
    "nursing": (INGEST_DIR / "nursing_providers_ingest.py", "nursing-providers"),
    "ecommerce": (INGEST_DIR / "shein_ingest.py", "ecommerce_shein_products"),
    "shein": (INGEST_DIR / "shein_ingest.py", "ecommerce_shein_products"),
    "ecom": (INGEST_DIR / "shein_ingest.py", "ecommerce_shein_products"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Ingest nursing providers or Shein eCommerce data into Elastic Cloud. "
            "The target index is always deleted (if present) and recreated."
        ),
    )
    parser.add_argument(
        "dataset",
        choices=sorted(TARGETS.keys()),
        help="Dataset to ingest: providers → nursing-providers, ecommerce → ecommerce_shein_products",
    )
    parser.add_argument(
        "--index",
        dest="es_index",
        default=None,
        help="Optional override of the index name for this run only",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    script, default_index = TARGETS[args.dataset]

    if not script.exists():
        print(f"Ingest script not found: {script}", file=sys.stderr)
        return 1

    # Dataset argument owns the index name (not variables.env / .env)
    es_index = args.es_index or default_index
    os.environ["_INGEST_INDEX"] = es_index
    # Drop any leftover ES_INDEX from old setups so it cannot override
    os.environ.pop("ES_INDEX", None)

    print(f"Running: {script.relative_to(ROOT)} ({args.dataset})")
    print(f"Index: {es_index} (delete if exists, then create + ingest)")
    runpy.run_path(str(script), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
