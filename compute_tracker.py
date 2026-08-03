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


def extract_price(market):
    """
    Extracts price with fallback logic:
    1. yes_bid
    2. last_price
    3. yes_ask
    """
    # Check yes_bid
    price = market.get("yes_bid")
    source = "yes_bid"

    # Fallback to last_price if yes_bid is None, 0, or missing
    if price is None or price == 0:
        price = market.get("last_price")
        source = "last_price"

    # Fallback to yes_ask if last_price is also None/0
    if price is None or price == 0:
        price = market.get("yes_ask")
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
        print("Check kalshi.com/markets directly for the current GPU series,")
        print("then query by series_ticker instead - see docs.kalshi.com.")
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
