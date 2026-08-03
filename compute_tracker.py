"""
compute_tracker.py (v2 - diagnostic update)

Why your CSV is likely empty: main() still returns early whenever
find_compute_events() comes back with nothing, and Kalshi's own
quick-start docs never actually demonstrate discovering markets by
browsing /events with no filter and keyword-matching titles - every
official example starts from a KNOWN series_ticker instead. That
mismatch, not a typo, is the most likely reason nothing gets written.
(Your extract_price() rewrite is solid, by the way - yes_bid_dollars
is the correct current field name. The bug is upstream of that.)

Fastest fix (about 2 minutes, no code):
1. Go to kalshi.com and search "compute" or "B200."
2. Open the market. The ticker is in the URL - same pattern as Kalshi's
   own docs example (kalshi.com/markets/kxhighny/... -> ticker is
   KXHIGHNY). Copy whatever the compute one's ticker actually is.
3. Paste it into SERIES_TICKER below.

If SERIES_TICKER is set, this script uses it directly (the reliable,
documented path). If it's left as None, it falls back to the discovery
approach - but now prints the raw response instead of failing silently,
so if it's still empty you can see exactly why (wrong param, empty
array, different key name) instead of guessing.
"""

import csv
import os
from datetime import datetime, timezone

import requests

BASE_URL = "https://external-api.kalshi.com/trade-api/v2"
OUTPUT_CSV = "compute_prices_history.csv"

SERIES_TICKER = None  # e.g. "KXCOMPUTEB200" - paste the real one once you find it
KEYWORDS = ["gpu", "compute", "b200", "h200", "a100", "h100", "nvidia"]


def get_markets_by_series(series_ticker):
    """The reliable path - this is the pattern Kalshi's own docs use."""
    resp = requests.get(
        f"{BASE_URL}/markets",
        params={"series_ticker": series_ticker, "status": "all", "limit": 200},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("markets", [])


def discover_compute_markets():
    """Fallback path. Prints the raw shape of the response so a zero
    result is diagnosable instead of silent."""
    resp = requests.get(f"{BASE_URL}/events", params={"limit": 200, "status": "open"}, timeout=15)
    print(f"GET /events -> HTTP {resp.status_code}")
    data = resp.json()
    print(f"Top-level keys in response: {list(data.keys())}")
    events = data.get("events", [])
    print(f"Total events returned: {len(events)}")
    if events:
        print(f"Sample event title: {events[0].get('title')}")

    matches = [e for e in events if any(k in e.get("title", "").lower() for k in KEYWORDS)]
    print(f"Events matching keywords {KEYWORDS}: {len(matches)}")

    markets = []
    for event in matches:
        r = requests.get(f"{BASE_URL}/markets", params={"event_ticker": event["event_ticker"]}, timeout=15)
        markets.extend(r.json().get("markets", []))
    return markets


def _to_cents(val):
    if val is None:
        return None
    try:
        v = float(val)
        return int(round(v * 100)) if v <= 1.0 else int(round(v))
    except (ValueError, TypeError):
        return None


def extract_price(market):
    for field, source in [
        ("yes_bid_dollars", "yes_bid"),
        ("last_price_dollars", "last_price"),
        ("yes_ask_dollars", "yes_ask"),
    ]:
        price = _to_cents(market.get(field))
        if price is not None:
            return price, source
    return None, "none"


def append_snapshot(rows):
    file_exists = os.path.isfile(OUTPUT_CSV)
    with open(OUTPUT_CSV, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(
                ["timestamp_utc", "series_or_source", "market_ticker", "title", "price_cents", "price_source"]
            )
        writer.writerows(rows)


def main():
    timestamp = datetime.now(timezone.utc).isoformat()

    if SERIES_TICKER:
        markets = get_markets_by_series(SERIES_TICKER)
        label = SERIES_TICKER
    else:
        print("SERIES_TICKER not set - falling back to keyword discovery.\n")
        markets = discover_compute_markets()
        label = "discovered"

    if not markets:
        print("\nStill nothing. Do the 2-minute manual lookup in the")
        print("docstring above rather than trusting discovery further.")
        return

    rows = []
    for market in markets:
        price, source = extract_price(market)
        rows.append([timestamp, label, market.get("ticker"), market.get("title"), price, source])
        print(f"{market.get('title')}: {price}c (via {source})")

    append_snapshot(rows)
    print(f"\nSaved {len(rows)} rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
