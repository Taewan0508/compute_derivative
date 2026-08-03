"""
compute_tracker.py

Starter script for tracking the AI-compute derivatives market: Kalshi's
public GPU compute forward curves (B200, H200, A100). Market data is
public on Kalshi's API - no API key needed.

What this does:
1. Pulls Kalshi's public events list and keyword-matches titles to find
   the current GPU/compute markets. Series tickers for a market this new
   aren't stable enough to hardcode blind, so this discovers them instead.
2. Pulls current prices for whatever compute markets it finds.
3. Appends a timestamped row per market to a local CSV. This CSV is your
   historical series - it only becomes valuable if you start capturing it
   now, since Kalshi won't backfill history you didn't record yourself.

Run this once a day (a free GitHub Actions cron job or a laptop cron
job both work) and in a few weeks you'll have a clean dataset that's
older than the market itself has been fully public.

Setup:
    pip install requests

Before relying on this: field names below (yes_bid, ticker, title, etc.)
and endpoint paths are based on Kalshi's public documentation excerpts,
not a full read of the current API reference. If a request 404s or a
field comes back empty, check the exact shape at https://docs.kalshi.com
and adjust - the overall approach (discover, don't hardcode; snapshot
daily; append, don't overwrite) will still hold.
"""

import csv
import os
from datetime import datetime, timezone

import requests

BASE_URL = "https://external-api.kalshi.com/trade-api/v2"
OUTPUT_CSV = "compute_prices_history.csv"
KEYWORDS = ["gpu", "compute", "b200", "h200", "a100", "h100", "nvidia"]


def find_compute_events():
    """Walk Kalshi's public events list and keyword-match titles."""
    resp = requests.get(f"{BASE_URL}/events", params={"limit": 200}, timeout=15)
    resp.raise_for_status()
    events = resp.json().get("events", [])

    return [
        e for e in events
        if any(k in e.get("title", "").lower() for k in KEYWORDS)
    ]


def get_markets_for_event(event_ticker):
    """Pull the current markets (and prices) for one event."""
    resp = requests.get(
        f"{BASE_URL}/markets", params={"event_ticker": event_ticker}, timeout=15
    )
    resp.raise_for_status()
    return resp.json().get("markets", [])


def append_snapshot(rows):
    """Append this run's snapshot to the local CSV, creating it if needed."""
    file_exists = os.path.isfile(OUTPUT_CSV)
    with open(OUTPUT_CSV, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(
                ["timestamp_utc", "event_ticker", "market_ticker", "title", "yes_bid_cents"]
            )
        writer.writerows(rows)


def main():
    timestamp = datetime.now(timezone.utc).isoformat()
    events = find_compute_events()

    if not events:
        print("No compute-related events matched by keyword.")
        print("Check kalshi.com/markets directly for the current GPU series,")
        print("then query by series_ticker instead - see docs.kalshi.com.")
        return

    rows = []
    for event in events:
        for market in get_markets_for_event(event["event_ticker"]):
            row = [
                timestamp,
                event["event_ticker"],
                market.get("ticker"),
                market.get("title"),
                market.get("yes_bid"),
            ]
            rows.append(row)
            print(f"{market.get('title')}: {market.get('yes_bid')}c")

    append_snapshot(rows)
    print(f"\nSaved {len(rows)} rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
