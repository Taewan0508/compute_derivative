import csv
import os
from datetime import datetime, timezone
 
import requests
 
BASE_URL = "https://external-api.kalshi.com/trade-api/v2"
OUTPUT_CSV = "compute_prices_history.csv"
 
SERIES_TICKER = None  # fastest fix if you find it manually on kalshi.com: paste it here
KEYWORDS = ["gpu", "compute", "b200", "h200", "a100", "h100", "nvidia"]
 
 
def get_markets_by_series(series_ticker):
    resp = requests.get(
        f"{BASE_URL}/markets",
        params={"series_ticker": series_ticker, "status": "all", "limit": 200},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("markets", [])
 
 
def find_compute_series():
    """Discover via /series - far fewer of these than /events, so
    keyword-matching here isn't fighting Kalshi's sports volume."""
    all_series = []
    cursor = None
    for _ in range(5):  # a handful of pages is enough for series-level counts
        params = {"limit": 200}
        if cursor:
            params["cursor"] = cursor
        resp = requests.get(f"{BASE_URL}/series", params=params, timeout=15)
        print(f"GET /series -> HTTP {resp.status_code}")
        data = resp.json()
        page = data.get("series", [])
        all_series.extend(page)
        cursor = data.get("cursor")
        if not cursor or not page:
            break
 
    print(f"Total series returned: {len(all_series)}")
    categories = sorted(set(s.get("category", "?") for s in all_series))
    print(f"Categories seen: {categories}")
 
    matches = [s for s in all_series if any(k in s.get("title", "").lower() for k in KEYWORDS)]
    print(f"Series matching keywords {KEYWORDS}: {len(matches)}")
    for s in matches:
        print(f"  {s.get('ticker')}: {s.get('title')}")
    return matches
 
 
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
                ["timestamp_utc", "series_ticker", "market_ticker", "title", "price_cents", "price_source"]
            )
        writer.writerows(rows)
 
 
def main():
    timestamp = datetime.now(timezone.utc).isoformat()
 
    if SERIES_TICKER:
        target_series = [{"ticker": SERIES_TICKER}]
    else:
        target_series = find_compute_series()
 
    if not target_series:
        print("\nStill nothing. Paste the exact categories printed above")
        print("into your next message so we can see the real taxonomy.")
        return
 
    rows = []
    for series in target_series:
        for market in get_markets_by_series(series["ticker"]):
            price, source = extract_price(market)
            rows.append(
                [timestamp, series["ticker"], market.get("ticker"), market.get("title"), price, source]
            )
            print(f"{market.get('title')}: {price}c (via {source})")
 
    if not rows:
        print("Found matching series but no markets under them - check status filter.")
        return
 
    append_snapshot(rows)
    print(f"\nSaved {len(rows)} rows to {OUTPUT_CSV}")
 
 
if __name__ == "__main__":
    main()
