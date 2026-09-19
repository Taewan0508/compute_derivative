"""Annualized basis between Ornn's forward curve and spot index, per GPU/tenor.

    basis(T) = ln( F_T / S ) / T

where F_T is the forward price for tenor T (months/12 years), S is the
current spot (daily index) price, and T is in years. This is the
continuously-compounded annualized cost-of-carry implied by Kalshi/Ornn's
compute forward curve relative to the spot GPU-hour price, so tenors of
different lengths are directly comparable.

Reads the two CSVs `ornn_backfill.py` already produces:
  - data/ornn_daily_index_snapshot.csv  -> S (spot, one row per GPU)
  - data/ornn_forward_curves.csv        -> F_T (one row per GPU x tenor)

and writes data/compute_basis_curve.csv.
"""

import math
import sys

import pandas as pd

from config import (
    COMPUTE_BASIS_CURVE_CSV,
    ORNN_DAILY_INDEX_SNAPSHOT_CSV,
    ORNN_FORWARD_CURVES_CSV,
    PROJECT_ROOT,
    ensure_data_dir,
)


def load_spot(path=ORNN_DAILY_INDEX_SNAPSHOT_CSV):
    """One spot price per GPU: gpu_name -> (spot_price, spot_as_of)."""
    df = pd.read_csv(path)
    df = df.rename(columns={"gpu_type": "gpu_name", "index_value": "spot_price", "date": "spot_as_of"})
    return df[["gpu_name", "spot_price", "spot_as_of"]]


def load_forward(path=ORNN_FORWARD_CURVES_CSV):
    df = pd.read_csv(path)
    return df[["gpu_name", "label", "months", "price", "as_of_date"]].rename(
        columns={"price": "forward_price", "as_of_date": "forward_as_of"}
    )


def compute_basis(spot_df, forward_df):
    """Join forward curve onto spot and compute annualized log basis per row.

    GPUs present in the forward curve but missing a spot print (e.g. B300,
    GB300, which Ornn doesn't index yet) are dropped with a warning rather
    than silently producing NaNs.
    """
    merged = forward_df.merge(spot_df, on="gpu_name", how="left")

    missing = sorted(merged.loc[merged["spot_price"].isna(), "gpu_name"].unique())
    if missing:
        print(f"WARNING: no spot price for {missing} — dropping their rows", file=sys.stderr)
    merged = merged.dropna(subset=["spot_price"]).copy()

    merged["T_years"] = merged["months"] / 12.0
    merged["basis_annualized"] = merged.apply(
        lambda r: math.log(r["forward_price"] / r["spot_price"]) / r["T_years"], axis=1
    )
    merged["basis_annualized_pct"] = merged["basis_annualized"] * 100.0

    cols = [
        "gpu_name",
        "label",
        "months",
        "T_years",
        "spot_price",
        "forward_price",
        "basis_annualized",
        "basis_annualized_pct",
        "spot_as_of",
        "forward_as_of",
    ]
    return merged[cols].sort_values(["gpu_name", "months"]).reset_index(drop=True)


def run():
    spot_df = load_spot()
    forward_df = load_forward()
    result = compute_basis(spot_df, forward_df)

    ensure_data_dir()
    result.to_csv(COMPUTE_BASIS_CURVE_CSV, index=False)
    print(f"→ {COMPUTE_BASIS_CURVE_CSV.relative_to(PROJECT_ROOT)}: {len(result)} rows\n")

    with pd.option_context("display.float_format", "{:.4f}".format):
        print(
            result.pivot(index="gpu_name", columns="label", values="basis_annualized_pct")
            .reindex(columns=[l for l in ["1M", "6M", "1Y", "3Y", "5Y"] if l in result["label"].unique()])
        )


if __name__ == "__main__":
    run()
