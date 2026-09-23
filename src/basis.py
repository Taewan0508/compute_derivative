"""Annualized basis between Ornn forward marks and spot index.

    basis(T) = ln( F_T / S ) / T

Ornn's /api/forward only returns *current published marks* (no historical
curve endpoint). Spot, meanwhile, has a full daily history. So:

  - For a single snapshot: join each forward mark to the spot print on the
    *same calendar day* as that mark's as_of_date (not "latest spot").
  - For a time series: archive every forward pull into
    data/ornn_forward_curves_history.csv (observation_date = pull day),
    then join spot on observation_date. Each daily archive becomes one
    basis observation — that is how historical basis is built going forward.

Past curve history cannot be reconstructed once marks move; only archived
pulls count.
"""

from __future__ import annotations

import math
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

from config import (
    COMPUTE_BASIS_CURVE_CSV,
    COMPUTE_BASIS_HISTORY_CSV,
    ORNN_FORWARD_CURVES_CSV,
    ORNN_FORWARD_CURVES_HISTORY_CSV,
    ORNN_GPU_DAILY_HISTORY_CSV,
    PROJECT_ROOT,
    ensure_data_dir,
)


def _to_date(value) -> date | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    ts = pd.to_datetime(value, utc=True)
    if pd.isna(ts):
        return None
    return ts.date()


def load_spot_history(path=ORNN_GPU_DAILY_HISTORY_CSV) -> pd.DataFrame:
    """Daily spot series: gpu_name, observation_date, spot_price."""
    df = pd.read_csv(path)
    df["observation_date"] = df["recorded_at"].map(_to_date)
    df = df.rename(columns={"index_value": "spot_price"})
    df = df.dropna(subset=["observation_date", "spot_price"])
    # one print per GPU-day (keep last if duplicates)
    return (
        df.sort_values("recorded_at")
        .groupby(["gpu_name", "observation_date"], as_index=False)
        .last()[["gpu_name", "observation_date", "spot_price"]]
    )


def load_forward_snapshot(path=ORNN_FORWARD_CURVES_CSV) -> pd.DataFrame:
    df = pd.read_csv(path)
    return df[["gpu_name", "label", "months", "price", "as_of_date"]].rename(
        columns={"price": "forward_price", "as_of_date": "forward_mark_as_of"}
    )


def append_forward_history(
    forward_df: pd.DataFrame | None = None,
    observation_date: date | None = None,
    history_path=ORNN_FORWARD_CURVES_HISTORY_CSV,
    snapshot_path=ORNN_FORWARD_CURVES_CSV,
) -> pd.DataFrame:
    """Append a forward snapshot to the archive (deduped by observation_date × GPU × tenor).

    Call this whenever you pull /api/forward so a basis time series can accumulate.
    """
    ensure_data_dir()
    if forward_df is None:
        forward_df = load_forward_snapshot(snapshot_path)
    else:
        forward_df = forward_df.copy()
        if "forward_price" not in forward_df.columns and "price" in forward_df.columns:
            forward_df = forward_df.rename(columns={"price": "forward_price"})
        if "forward_mark_as_of" not in forward_df.columns and "as_of_date" in forward_df.columns:
            forward_df = forward_df.rename(columns={"as_of_date": "forward_mark_as_of"})

    obs = observation_date or date.today()
    rows = forward_df[["gpu_name", "label", "months", "forward_price", "forward_mark_as_of"]].copy()
    rows["observation_date"] = obs
    rows["pulled_at"] = datetime.now(timezone.utc).isoformat()

    if history_path.exists():
        existing = pd.read_csv(history_path)
        existing["observation_date"] = existing["observation_date"].map(_to_date)
        combined = pd.concat([existing, rows], ignore_index=True)
    else:
        combined = rows

    combined["observation_date"] = combined["observation_date"].map(_to_date)
    combined = (
        combined.sort_values("pulled_at")
        .drop_duplicates(subset=["observation_date", "gpu_name", "label"], keep="last")
        .sort_values(["observation_date", "gpu_name", "months"])
        .reset_index(drop=True)
    )
    combined.to_csv(history_path, index=False)
    print(f"→ {history_path.relative_to(PROJECT_ROOT)}: {len(combined)} rows")
    return combined


def load_forward_history(path=ORNN_FORWARD_CURVES_HISTORY_CSV) -> pd.DataFrame:
    if not Path(path).exists():
        # Bootstrap archive from the latest snapshot so we have at least one obs.
        print(
            f"No {path.name} yet — seeding from {ORNN_FORWARD_CURVES_CSV.name}",
            file=sys.stderr,
        )
        snap = load_forward_snapshot()
        # Use each mark's own calendar day as the first observation when seeding,
        # so spot can align without inventing a pull date.
        snap = snap.copy()
        snap["observation_date"] = snap["forward_mark_as_of"].map(_to_date)
        snap["pulled_at"] = datetime.now(timezone.utc).isoformat()
        ensure_data_dir()
        snap.to_csv(path, index=False)
        return snap

    df = pd.read_csv(path)
    df["observation_date"] = df["observation_date"].map(_to_date)
    if "forward_price" not in df.columns and "price" in df.columns:
        df = df.rename(columns={"price": "forward_price"})
    if "forward_mark_as_of" not in df.columns and "as_of_date" in df.columns:
        df = df.rename(columns={"as_of_date": "forward_mark_as_of"})
    return df


def compute_basis(spot_history: pd.DataFrame, forward_history: pd.DataFrame) -> pd.DataFrame:
    """Join forwards to same-day spot and compute annualized log basis.

    observation_date is the basis date (spot and forward curve as observed that day).
    forward_mark_as_of is Ornn's edit timestamp on the mark (may be older).
    """
    fwd = forward_history.copy()
    fwd["observation_date"] = fwd["observation_date"].map(_to_date)
    if fwd["observation_date"].isna().any():
        # fall back to mark calendar day
        fwd.loc[fwd["observation_date"].isna(), "observation_date"] = fwd.loc[
            fwd["observation_date"].isna(), "forward_mark_as_of"
        ].map(_to_date)

    merged = fwd.merge(spot_history, on=["gpu_name", "observation_date"], how="left")

    missing_gpu = sorted(merged.loc[merged["spot_price"].isna(), "gpu_name"].unique())
    if missing_gpu:
        # GPUs with no OCPI spot at all (B300, GB300, …)
        no_spot_ever = sorted(
            g
            for g in missing_gpu
            if g not in set(spot_history["gpu_name"])
        )
        if no_spot_ever:
            print(
                f"WARNING: no spot series for {no_spot_ever} — dropping",
                file=sys.stderr,
            )
        missing_day = merged[merged["spot_price"].isna() & ~merged["gpu_name"].isin(no_spot_ever)]
        if not missing_day.empty:
            print(
                f"WARNING: {len(missing_day)} rows missing spot on observation_date "
                f"(e.g. {missing_day[['gpu_name','observation_date']].head(3).to_dict('records')})",
                file=sys.stderr,
            )

    merged = merged.dropna(subset=["spot_price", "forward_price", "observation_date"]).copy()
    merged["T_years"] = merged["months"] / 12.0
    merged["basis_annualized"] = merged.apply(
        lambda r: math.log(r["forward_price"] / r["spot_price"]) / r["T_years"],
        axis=1,
    )
    merged["basis_annualized_pct"] = merged["basis_annualized"] * 100.0
    # Same calendar day for both legs of the join
    merged["spot_as_of"] = merged["observation_date"].astype(str)
    merged["forward_as_of"] = merged["observation_date"].astype(str)

    cols = [
        "observation_date",
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
        "forward_mark_as_of",
    ]
    return (
        merged[cols]
        .sort_values(["observation_date", "gpu_name", "months"])
        .reset_index(drop=True)
    )


def run(seed_archive: bool = True):
    ensure_data_dir()
    spot = load_spot_history()
    forward_hist = load_forward_history() if seed_archive else pd.read_csv(ORNN_FORWARD_CURVES_HISTORY_CSV)

    result = compute_basis(spot, forward_hist)
    result.to_csv(COMPUTE_BASIS_HISTORY_CSV, index=False)
    print(f"→ {COMPUTE_BASIS_HISTORY_CSV.relative_to(PROJECT_ROOT)}: {len(result)} rows")

    # Latest curve view: most recent observation_date per GPU×tenor
    cols = [
        "observation_date",
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
        "forward_mark_as_of",
    ]
    latest = (
        result.sort_values("observation_date")
        .groupby(["gpu_name", "label"], as_index=False)
        .last()[cols]
        .sort_values(["gpu_name", "months"])
        .reset_index(drop=True)
    )
    latest.to_csv(COMPUTE_BASIS_CURVE_CSV, index=False)
    print(f"→ {COMPUTE_BASIS_CURVE_CSV.relative_to(PROJECT_ROOT)}: {len(latest)} rows\n")

    obs_dates = sorted(result["observation_date"].unique())
    print(f"observation dates in series: {len(obs_dates)} "
          f"({obs_dates[0]} → {obs_dates[-1]})" if obs_dates else "no observations")

    with pd.option_context("display.float_format", "{:.4f}".format):
        print("\nLatest basis_annualized_pct:")
        print(
            latest.pivot(index="gpu_name", columns="label", values="basis_annualized_pct")
            .reindex(
                columns=[l for l in ["1M", "6M", "1Y", "3Y", "5Y"] if l in latest["label"].unique()]
            )
        )


if __name__ == "__main__":
    run()
