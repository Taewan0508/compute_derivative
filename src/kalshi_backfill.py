"""Backfill Kalshi candlestick history for all compute markets."""

import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path.cwd() / ".env")

from compute_tracker import find_compute_series, safe_get  # noqa: E402
from config import (  # noqa: E402
    KALSHI_CANDLE_PERIOD_DAILY,
    KALSHI_CANDLESTICKS,
    KALSHI_CANDLES_MAX_DAYS_FALLBACK,
    KALSHI_MARKETS,
    KALSHI_MARKETS_PRICE_HISTORY_CSV,
    KALSHI_MARKETS_SNAPSHOT_CSV,
    KALSHI_PAGE_LIMIT,
    PROJECT_ROOT,
    ensure_data_dir,
)


def get_all_markets_for_series(series_ticker, max_pages=50):
    markets, cursor = [], None
    for _ in range(max_pages):
        params = {"series_ticker": series_ticker, "limit": KALSHI_PAGE_LIMIT}
        if cursor:
            params["cursor"] = cursor
        data = safe_get(KALSHI_MARKETS, params)
        if not data:
            break
        page = data.get("markets", [])
        markets.extend(page)
        cursor = data.get("cursor")
        if not cursor or not page:
            break
    return markets


def market_row(series, market):
    return {
        "series_ticker": series.get("ticker"),
        "series_title": series.get("title"),
        "market_ticker": market.get("ticker"),
        "title": market.get("title"),
        "status": market.get("status"),
        "yes_bid": market.get("yes_bid_dollars"),
        "yes_ask": market.get("yes_ask_dollars"),
        "last_price": market.get("last_price_dollars"),
        "previous_price": market.get("previous_price_dollars"),
        "volume": market.get("volume_fp"),
        "volume_24h": market.get("volume_24h_fp"),
        "open_interest": market.get("open_interest_fp"),
        "liquidity": market.get("liquidity_dollars"),
        "floor_strike": market.get("floor_strike"),
        "open_time": market.get("open_time"),
        "close_time": market.get("close_time"),
        "created_time": market.get("created_time"),
        "updated_time": market.get("updated_time"),
        "event_ticker": market.get("event_ticker"),
        "rules_primary": market.get("rules_primary"),
    }


def _parse_ts(value):
    if not value:
        return None
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())


def get_candlesticks(series_ticker, market_ticker, open_time=None, created_time=None):
    end_ts = int(time.time())
    start_ts = _parse_ts(open_time) or _parse_ts(created_time)
    if not start_ts:
        start_ts = end_ts - KALSHI_CANDLES_MAX_DAYS_FALLBACK * 24 * 3600
    path = KALSHI_CANDLESTICKS.format(series_ticker=series_ticker, ticker=market_ticker)
    data = safe_get(
        path,
        {"start_ts": start_ts, "end_ts": end_ts, "period_interval": KALSHI_CANDLE_PERIOD_DAILY},
    )
    return data.get("candlesticks", []) if data else []


def candles_to_rows(series_ticker, market_ticker, candles):
    rows = []
    for c in candles:
        price = c.get("price") or {}
        yes_bid = c.get("yes_bid") or {}
        yes_ask = c.get("yes_ask") or {}
        rows.append(
            {
                "series_ticker": series_ticker,
                "market_ticker": market_ticker,
                "end_period_ts": c.get("end_period_ts"),
                "end_period_utc": datetime.fromtimestamp(
                    c["end_period_ts"], tz=timezone.utc
                ).isoformat()
                if c.get("end_period_ts")
                else None,
                "volume": c.get("volume_fp"),
                "open_interest": c.get("open_interest_fp"),
                "price_open": price.get("open_dollars"),
                "price_high": price.get("high_dollars"),
                "price_low": price.get("low_dollars"),
                "price_close": price.get("close_dollars"),
                "yes_bid_close": yes_bid.get("close_dollars"),
                "yes_ask_close": yes_ask.get("close_dollars"),
            }
        )
    return rows


def pull_markets_snapshot():
    print("\n=== Kalshi: markets snapshot ===")
    all_markets = []
    for series in find_compute_series():
        mkts = get_all_markets_for_series(series["ticker"])
        print(f"  {series['ticker']}: {len(mkts)} markets")
        all_markets.extend(market_row(series, m) for m in mkts)
    markets_df = pd.DataFrame(all_markets)
    ensure_data_dir()
    markets_df.to_csv(KALSHI_MARKETS_SNAPSHOT_CSV, index=False)
    print(f"  → {KALSHI_MARKETS_SNAPSHOT_CSV.relative_to(PROJECT_ROOT)}: {len(markets_df)} rows")
    return markets_df


def pull_price_history(markets_df, statuses=None, sleep_sec=0.15):
    statuses = statuses or ["active"]
    targets = markets_df[markets_df["status"].isin(statuses)]
    print(f"\n=== Kalshi: candlestick history ({len(targets)} markets, statuses={statuses}) ===")

    history_rows = []
    for i, (_, row) in enumerate(targets.iterrows(), 1):
        candles = get_candlesticks(
            row["series_ticker"],
            row["market_ticker"],
            open_time=row.get("open_time"),
            created_time=row.get("created_time"),
        )
        history_rows.extend(
            candles_to_rows(row["series_ticker"], row["market_ticker"], candles)
        )
        if i % 25 == 0 or i == len(targets):
            print(f"  {i}/{len(targets)} markets, {len(history_rows)} candles so far")
        time.sleep(sleep_sec)

    history_df = pd.DataFrame(history_rows)
    ensure_data_dir()
    history_df.to_csv(KALSHI_MARKETS_PRICE_HISTORY_CSV, index=False)
    print(f"  → {KALSHI_MARKETS_PRICE_HISTORY_CSV.relative_to(PROJECT_ROOT)}: {len(history_df)} rows")
    return history_df


def main():
    markets_df = pull_markets_snapshot()
    if markets_df.empty:
        print("No markets found.", file=sys.stderr)
        sys.exit(1)
    pull_price_history(markets_df, statuses=["active"])
    print("\nDone.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
