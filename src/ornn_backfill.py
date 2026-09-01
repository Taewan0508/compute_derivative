"""Pull all available Ornn datasets during Premium trial."""

import json
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path.cwd() / ".env")

from config import (  # noqa: E402
    ORNN_COMPUTE_BUYERS_CSV,
    ORNN_DAILY_INDEX_SNAPSHOT_CSV,
    ORNN_DAILY_INDEX_SNAPSHOT_JSON,
    ORNN_FORWARD_CURVES_CSV,
    ORNN_FORWARD_CURVES_JSON,
    ORNN_GPU_CURRENT_CSV,
    ORNN_GPU_DAILY_HISTORY_CSV,
    ORNN_GPU_VOLATILITY_CSV,
    ORNN_GPU_VOLUME_METRICS_CSV,
    ORNN_GPUS,
    ORNN_HISTORY_START_DATE,
    ORNN_MEMORY_HISTORY_CSV,
    ORNN_MEMORY_INDEX_CSV,
    ORNN_MEMORY_TYPES_JSON,
    ORNN_MODEL_FRONTIER_JSON,
    ORNN_OTPI_HISTORY_CSV,
    ORNN_POWER_MARKETS_CSV,
    ORNN_TOKEN_TYPES_JSON,
    ORNN_TOKEN_VOLUME_CSV,
    PROJECT_ROOT,
    ensure_data_dir,
)
from ornn_client import (  # noqa: E402
    daily_index_to_rows,
    forward_to_rows,
    get_compute_buyers,
    get_daily_index_all,
    get_forward_curves,
    get_gpu_current,
    get_gpu_history_full,
    get_gpu_volatility,
    get_gpu_volume_metrics,
    get_memory_history,
    get_memory_index,
    get_memory_types,
    get_model_frontier,
    get_otpi_history,
    get_power_markets_history,
    get_token_types,
    get_token_volume,
    labeled_rows,
    memory_index_to_rows,
    records_to_rows,
    summarize_fields,
    test_ornn_connection,
)


def _write_csv(rows, path):
    ensure_data_dir()
    df = pd.DataFrame(rows)
    df.to_csv(path, index=False)
    print(f"  → {path.relative_to(PROJECT_ROOT)}: {len(df)} rows")
    return df


def _write_json(data, path):
    ensure_data_dir()
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  → {path.relative_to(PROJECT_ROOT)} (raw)")


def pull_high_priority():
    print("\n=== HIGH: daily index snapshot ===")
    snapshot = get_daily_index_all()
    if not snapshot or not snapshot.get("success"):
        raise RuntimeError("Failed to fetch /api/daily-index/all")
    _write_csv(daily_index_to_rows(snapshot), ORNN_DAILY_INDEX_SNAPSHOT_CSV)
    _write_json(snapshot, ORNN_DAILY_INDEX_SNAPSHOT_JSON)

    print("\n=== HIGH: GPU daily history (all dates) ===")
    history_rows = []
    for gpu in ORNN_GPUS:
        records, _ = get_gpu_history_full(gpu, granularity="daily")
        history_rows.extend(records_to_rows(gpu, records))
        ts_col = "recorded_at" if records and "recorded_at" in records[0] else "timestamp"
        if records:
            print(
                f"  {gpu}: {len(records)} rows "
                f"({records[0].get(ts_col, '')[:10]} → {records[-1].get(ts_col, '')[:10]})"
            )
        else:
            print(f"  {gpu}: 0 rows")
    _write_csv(history_rows, ORNN_GPU_DAILY_HISTORY_CSV)
    print("  Fields:", summarize_fields(history_rows))


def pull_medium_priority():
    print("\n=== MEDIUM: volatility ===")
    vol_rows = []
    for gpu in ORNN_GPUS:
        vol = get_gpu_volatility(gpu)
        vol_rows.extend(records_to_rows(gpu, vol))
        print(f"  {gpu}: {len(vol)} rows")
    _write_csv(vol_rows, ORNN_GPU_VOLATILITY_CSV)

    print("\n=== MEDIUM: volume metrics ===")
    metric_rows = []
    for gpu in ORNN_GPUS:
        metrics = get_gpu_volume_metrics(gpu)
        metric_rows.extend(records_to_rows(gpu, metrics))
        print(f"  {gpu}: {len(metrics)} rows")
    _write_csv(metric_rows, ORNN_GPU_VOLUME_METRICS_CSV)

    print("\n=== MEDIUM: forward curves ===")
    forward = get_forward_curves()
    if not forward or not forward.get("success"):
        raise RuntimeError("Failed to fetch /api/forward")
    _write_csv(forward_to_rows(forward), ORNN_FORWARD_CURVES_CSV)
    _write_json(forward, ORNN_FORWARD_CURVES_JSON)


def pull_low_priority():
    print("\n=== LOW: GPU current snapshots ===")
    current_rows = []
    for gpu in ORNN_GPUS:
        data = get_gpu_current(gpu)
        if data and data.get("data"):
            row = dict(data["data"])
            row["gpu_name"] = gpu
            current_rows.append(row)
            print(f"  {gpu}: ok")
        else:
            print(f"  {gpu}: no data")
    _write_csv(current_rows, ORNN_GPU_CURRENT_CSV)

    print("\n=== LOW: OTPI token prices ===")
    token_types = get_token_types()
    _write_json({"data": token_types}, ORNN_TOKEN_TYPES_JSON)
    print(f"  token types: {len(token_types)}")
    otpi_rows = get_otpi_history()
    _write_csv(otpi_rows, ORNN_OTPI_HISTORY_CSV)
    print("  Fields:", summarize_fields(otpi_rows))

    print("\n=== LOW: memory prices ===")
    memory_types = get_memory_types()
    _write_json({"data": memory_types}, ORNN_MEMORY_TYPES_JSON)
    print(f"  memory types: {len(memory_types)}")
    memory_index = get_memory_index()
    _write_csv(memory_index_to_rows(memory_index), ORNN_MEMORY_INDEX_CSV)

    memory_history_rows = []
    for item in memory_types:
        mem_id = item.get("id") or item.get("memory_type") or item.get("name")
        if not mem_id:
            continue
        records = get_memory_history(mem_id)
        memory_history_rows.extend(labeled_rows(records, "memory_type", mem_id))
        print(f"  {mem_id}: {len(records)} rows")
    _write_csv(memory_history_rows, ORNN_MEMORY_HISTORY_CSV)

    print("\n=== LOW: power markets (daily, back to 2017) ===")
    power_rows = get_power_markets_history()
    _write_csv(power_rows, ORNN_POWER_MARKETS_CSV)
    print("  Fields:", summarize_fields(power_rows))

    print("\n=== LOW: token volume (if available) ===")
    end = pd.Timestamp.utcnow().strftime("%Y-%m-%d")
    vol_rows = get_token_volume(ORNN_HISTORY_START_DATE, end)
    if vol_rows:
        _write_csv(vol_rows, ORNN_TOKEN_VOLUME_CSV)
    else:
        print("  skipped (no data or endpoint unavailable on Premium)")

    print("\n=== LOW: model frontier ===")
    frontier = get_model_frontier()
    if frontier:
        _write_json(frontier, ORNN_MODEL_FRONTIER_JSON)
    else:
        print("  skipped")

    print("\n=== LOW: compute buyers ===")
    buyers = get_compute_buyers()
    if buyers:
        rows = buyers.get("data", buyers) if isinstance(buyers, dict) else buyers
        if isinstance(rows, list):
            _write_csv(rows, ORNN_COMPUTE_BUYERS_CSV)
        else:
            _write_json(buyers, ORNN_COMPUTE_BUYERS_CSV.with_suffix(".json"))
    else:
        print("  skipped")


def main():
    if not os.environ.get("ORNN_API_KEY"):
        print("ERROR: Set ORNN_API_KEY in .env", file=sys.stderr)
        sys.exit(1)
    if not test_ornn_connection():
        print("ERROR: Ornn API unreachable", file=sys.stderr)
        sys.exit(1)

    print("Ornn full backfill starting")
    pull_high_priority()
    pull_medium_priority()
    pull_low_priority()
    print("\nDone.")


if __name__ == "__main__":
    main()
