"""Pull high + medium priority Ornn datasets during Premium trial."""

import json
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path.cwd() / ".env")

from config import (  # noqa: E402
    ORNN_DAILY_INDEX_SNAPSHOT_CSV,
    ORNN_DAILY_INDEX_SNAPSHOT_JSON,
    ORNN_FORWARD_CURVES_CSV,
    ORNN_FORWARD_CURVES_JSON,
    ORNN_GPU_DAILY_HISTORY_CSV,
    ORNN_GPU_VOLATILITY_CSV,
    ORNN_GPU_VOLUME_METRICS_CSV,
    ORNN_GPUS,
    PROJECT_ROOT,
    ensure_data_dir,
)
from ornn_client import (  # noqa: E402
    daily_index_to_rows,
    forward_to_rows,
    get_daily_index_all,
    get_forward_curves,
    get_gpu_history_full,
    get_gpu_volatility,
    get_gpu_volume_metrics,
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


def pull_high_priority():
    print("\n=== HIGH: daily index snapshot ===")
    snapshot = get_daily_index_all()
    if not snapshot or not snapshot.get("success"):
        raise RuntimeError("Failed to fetch /api/daily-index/all")
    snapshot_rows = daily_index_to_rows(snapshot)
    _write_csv(snapshot_rows, ORNN_DAILY_INDEX_SNAPSHOT_CSV)
    ensure_data_dir()
    with open(ORNN_DAILY_INDEX_SNAPSHOT_JSON, "w") as f:
        json.dump(snapshot, f, indent=2)
    print(f"  → {ORNN_DAILY_INDEX_SNAPSHOT_JSON.relative_to(PROJECT_ROOT)} (raw)")

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
    history_df = _write_csv(history_rows, ORNN_GPU_DAILY_HISTORY_CSV)
    print("  Fields:", summarize_fields(history_rows))
    return history_df


def pull_medium_priority():
    print("\n=== MEDIUM: volatility ===")
    vol_rows = []
    for gpu in ORNN_GPUS:
        vol = get_gpu_volatility(gpu)
        vol_rows.extend(records_to_rows(gpu, vol))
        print(f"  {gpu}: {len(vol)} rows")
    vol_df = _write_csv(vol_rows, ORNN_GPU_VOLATILITY_CSV)
    print("  Fields:", summarize_fields(vol_rows))

    print("\n=== MEDIUM: volume metrics ===")
    metric_rows = []
    for gpu in ORNN_GPUS:
        metrics = get_gpu_volume_metrics(gpu)
        metric_rows.extend(records_to_rows(gpu, metrics))
        print(f"  {gpu}: {len(metrics)} rows")
    metric_df = _write_csv(metric_rows, ORNN_GPU_VOLUME_METRICS_CSV)
    print("  Fields:", summarize_fields(metric_rows))

    print("\n=== MEDIUM: forward curves ===")
    forward = get_forward_curves()
    if not forward or not forward.get("success"):
        raise RuntimeError("Failed to fetch /api/forward")
    forward_rows = forward_to_rows(forward)
    forward_df = _write_csv(forward_rows, ORNN_FORWARD_CURVES_CSV)
    ensure_data_dir()
    with open(ORNN_FORWARD_CURVES_JSON, "w") as f:
        json.dump(forward, f, indent=2)
    print(f"  → {ORNN_FORWARD_CURVES_JSON.relative_to(PROJECT_ROOT)} (raw)")
    print("  Fields:", summarize_fields(forward_rows))
    return vol_df, metric_df, forward_df


def main():
    if not os.environ.get("ORNN_API_KEY"):
        print("ERROR: Set ORNN_API_KEY in .env", file=sys.stderr)
        sys.exit(1)
    if not test_ornn_connection():
        print("ERROR: Ornn API unreachable", file=sys.stderr)
        sys.exit(1)

    print("Ornn backfill starting (high + medium priority)")
    pull_high_priority()
    pull_medium_priority()
    print("\nDone.")


if __name__ == "__main__":
    main()
