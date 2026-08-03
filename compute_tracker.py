"""
compute_tracker.py

Starter script for tracking the AI-compute derivatives market: Kalshi's
public GPU compute forward curves (B200, H200, A100). Market data is
public on Kalshi's API - no API key needed.
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


def _to_cents(val):
    """Convert float, int, or string dollar amount ('0.4200') to integer cents."""
    if val is None:
        return None
    try:
        val_float = float(val)
        if val_float <= 0:
            return None
        # Convert dollar representation (0.42) to cents (42) if <= 1.0
        return int(round(val_float * 100)) if val_float <= 1.0 else int(round(val_float))
    except (ValueError, TypeError):
        return None


def extract_price(market):
    """
    Extracts price using Kalshi's v2 fixed-point dollar fields with legacy fallbacks:
    1. yes_bid_dollars / yes_bid
    2. last_price_dollars / last_price
    3. yes_ask_dollars / yes_ask
    """
    # 1. Try yes_bid
    price = _to_cents(market.get("yes_bid_dollars")) or _to_cents(market.get("yes_bid"))
    source = "yes_bid"

    # 2. Fallback to last_price
    if price is None:
        price = _to_cents(market.get("last_price_dollars")) or _to_cents(market.get("last_price"))
        source = "last_price"

    # 3. Fallback to yes_ask
    if price is None:
        price = _to_cents(market.get("yes_ask_dollars")) or _to_cents(market.get("yes_ask"))
        source = "yes_ask"

    return price, source


def append_snapshot(rows):
    """Append this run's snapshot to the local CSV, creating it if needed."""
    file_exists = os.path.isfile(OUTPUT_CSV)
    with open(OUTPUT_CSV, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(
                [
                    "timestamp_utc",
                    "event_ticker",
                    "market_ticker",
                    "title",
                    "price_cents",
                    "price_source",
                ]
            )
        writer.writerows(rows)


def main():
    timestamp = datetime.now(timezone.utc).isoformat()
    events = find_compute_events()

    if not events:
        print("No compute-related events matched by keyword.")
        return

    rows = []
    for event in events:
        for market in get_markets_for_event(event["event_ticker"]):
            price, source = extract_price(market)
            row = [
                timestamp,
                event["event_ticker"],
                market.get("ticker"),
                market.get("title"),
                price,
                source,
            ]
            rows.append(row)
            print(f"{market.get('title')}: {price}c (via {source})")

    append_snapshot(rows)
    print(f"\nSaved {len(rows)} rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
