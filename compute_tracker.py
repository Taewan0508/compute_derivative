import csv
import os
import sys
import traceback
from datetime import datetime, timezone
 
import requests
 
BASE_URL = "https://external-api.kalshi.com/trade-api/v2"
OUTPUT_CSV = "compute_prices_history.csv"
SERIES_TICKER = None  # fastest fix if found manually on kalshi.com: paste it here
KEYWORDS = ["gpu", "compute", "b200", "h200", "a100", "h100", "nvidia"]
 
SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (compatible; ComputeTracker/1.0; "
        "+https://github.com/Taewan0508/compute_derivative)",
        "Accept": "application/json",
    }
)
 
 
def safe_get(path, params=None):
    """Never raises. Returns parsed JSON, or None with full diagnostics
    printed if anything at all went wrong."""
    url = f"{BASE_URL}{path}"
    try:
        resp = SESSION.get(url, params=params, timeout=15)
    except requests.exceptions.RequestException as e:
        print(f"NETWORK ERROR calling {path}: {type(e).__name__}: {e}")
        return None
 
    print(f"GET {path} -> HTTP {resp.status_code}")
    if resp.status_code != 200:
        print(f"  Response headers: {dict(resp.headers)}")
        print(f"  Response body (first 500 chars): {resp.text[:500]!r}")
        return None
 
    try:
        return resp.json()
    except ValueError as e:
        print(f"  Response wasn't valid JSON: {e}")
        print(f"  Content-Type: {resp.headers.get('content-type')}")
        print(f"  Response body (first 500 chars): {resp.text[:500]!r}")
        return None
 
 
def find_compute_series():
    all_series = []
    cursor = None
    for _ in range(5):
        params = {"limit": 200}
        if cursor:
            params["cursor"] = cursor
        data = safe_get("/series", params)
        if data is None:
            print("Could not read /series - see diagnostics above.")
            break
        page = data.get("series", [])
        all_series.extend(page)
        cursor = data.get("cursor")
        if not cursor or not page:
            break
 
    print(f"Total series collected: {len(all_series)}")
    if all_series:
        print(f"Categories seen: {sorted(set(s.get('category', '?') for s in all_series))}")
 
    matches = [s for s in all_series if any(k in s.get("title", "").lower() for k in KEYWORDS)]
    print(f"Series matching keywords {KEYWORDS}: {len(matches)}")
    for s in matches:
        print(f"  {s.get('ticker')}: {s.get('title')}")
    return matches
 
 
def get_markets_by_series(series_ticker):
    data = safe_get("/markets", {"series_ticker": series_ticker, "status": "all", "limit": 200})
    return data.get("markets", []) if data else []
 
 
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
 
 
def run():
    timestamp = datetime.now(timezone.utc).isoformat()
    target_series = [{"ticker": SERIES_TICKER}] if SERIES_TICKER else find_compute_series()
 
    if not target_series:
        print("\nNo series to query. See diagnostics above for why.")
        return
 
    rows = []
    for series in target_series:
        for market in get_markets_by_series(series["ticker"]):
            price, source = extract_price(market)
            rows.append([timestamp, series["ticker"], market.get("ticker"), market.get("title"), price, source])
            print(f"{market.get('title')}: {price}c (via {source})")
 
    if not rows:
        print("Found series but no markets under them - check the status filter.")
        return
 
    append_snapshot(rows)
    print(f"\nSaved {len(rows)} rows to {OUTPUT_CSV}")
 
 
def main():
    try:
        run()
    except Exception:
        print("UNHANDLED EXCEPTION:")
        traceback.print_exc()
        sys.exit(1)
 
 
if __name__ == "__main__":
    main()
