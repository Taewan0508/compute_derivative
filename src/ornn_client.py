import os
import time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

import requests
from dotenv import load_dotenv

from config import (
    BASE_ORNN_URL,
    ORNN_CONNECT_TIMEOUT_SEC,
    ORNN_DAILY_INDEX_ALL,
    ORNN_FORWARD,
    ORNN_GPU_HISTORY_RANGE,
    ORNN_GPU_TYPES,
    ORNN_GPU_VOLATILITY,
    ORNN_GPU_VOLUME_METRICS,
    ORNN_GPUS,
    ORNN_HISTORY_LIMIT,
    ORNN_HISTORY_START_DATE,
    ORNN_MAX_RETRIES,
    ORNN_READ_TIMEOUT_SEC,
    USER_AGENT,
)

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path.cwd() / ".env")

SESSION = requests.Session()
SESSION.headers.update(
    {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
)

ORNN_TIMEOUT = (ORNN_CONNECT_TIMEOUT_SEC, ORNN_READ_TIMEOUT_SEC)


def _auth_headers():
    key = os.environ.get("ORNN_API_KEY")
    if not key:
        return {}
    return {"Authorization": f"Bearer {key}"}


def ornn_url(path: str, **path_params) -> str:
    encoded = {k: quote(v, safe="") for k, v in path_params.items()}
    return BASE_ORNN_URL + path.format(**encoded)


def ornn_get(path: str, params=None, path_params=None, quiet_not_found=False):
    """GET Ornn API. Returns parsed JSON or None with diagnostics."""
    path_params = path_params or {}
    url = ornn_url(path, **path_params) if path_params else BASE_ORNN_URL + path
    headers = _auth_headers()

    for attempt in range(1, ORNN_MAX_RETRIES + 1):
        try:
            resp = SESSION.get(url, params=params, headers=headers, timeout=ORNN_TIMEOUT)
        except requests.exceptions.Timeout as e:
            print(f"ORNN TIMEOUT (attempt {attempt}/{ORNN_MAX_RETRIES}) {url}: {e}")
            if attempt < ORNN_MAX_RETRIES:
                time.sleep(2 * attempt)
                continue
            return None
        except requests.exceptions.RequestException as e:
            print(f"ORNN NETWORK ERROR {url}: {type(e).__name__}: {e}")
            if attempt < ORNN_MAX_RETRIES:
                time.sleep(2 * attempt)
                continue
            return None

        print(f"GET {url} -> HTTP {resp.status_code}")
        if resp.status_code == 404 and quiet_not_found:
            return None
        if resp.status_code != 200:
            print(f"  body: {resp.text[:500]!r}")
            return None

        try:
            return resp.json()
        except ValueError as e:
            print(f"  invalid JSON: {e}")
            return None

    return None


def test_ornn_connection():
    """Quick connectivity check; returns True if /api/daily-index/all succeeds."""
    data = get_daily_index_all()
    return bool(data and data.get("success"))


def get_gpu_types():
    data = ornn_get(ORNN_GPU_TYPES)
    return data.get("data", []) if data else []


def get_daily_index_all():
    return ornn_get(ORNN_DAILY_INDEX_ALL)


def get_forward_curves():
    return ornn_get(ORNN_FORWARD)


def daily_index_to_rows(response):
    """Flatten /api/daily-index/all into CSV-friendly rows."""
    if not response:
        return []
    as_of = response.get("date")
    rows = []
    for item in response.get("data", []):
        row = dict(item)
        row["as_of"] = as_of
        rows.append(row)
    return rows


def forward_to_rows(response):
    """Flatten /api/forward nested curves into one row per GPU × tenor."""
    if not response:
        return []
    as_of = response.get("asOf")
    rows = []
    for curve in response.get("data", []):
        gpu_name = curve.get("name")
        for point in curve.get("data", []):
            provenance = point.get("provenance") or {}
            rows.append(
                {
                    "gpu_name": gpu_name,
                    "label": point.get("label"),
                    "months": point.get("months"),
                    "price": point.get("price"),
                    "has_mark": point.get("has_mark"),
                    "as_of_date": point.get("as_of_date"),
                    "provenance_source": provenance.get("source"),
                    "provenance_updated_at": provenance.get("updated_at"),
                    "provenance_sample_count": provenance.get("sample_count"),
                    "insufficient_data": point.get("insufficient_data"),
                    "curve_as_of": as_of,
                }
            )
    return rows


def _parse_iso_date(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def _year_chunks(start_date, end_date):
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    year = start.year
    while year <= end.year:
        chunk_start = date(year, 1, 1)
        if chunk_start < start:
            chunk_start = start
        chunk_end = date(year, 12, 31)
        if chunk_end > end:
            chunk_end = end
        yield chunk_start.isoformat(), chunk_end.isoformat()
        year += 1


def get_gpu_history_range(
    gpu_name,
    start_date=ORNN_HISTORY_START_DATE,
    end_date=None,
    granularity="daily",
    limit=ORNN_HISTORY_LIMIT,
):
    """One history-range request. Returns (rows, query_metadata)."""
    params = {
        "startDate": start_date,
        "endDate": end_date or date.today().isoformat(),
        "granularity": granularity,
        "limit": limit,
    }
    data = ornn_get(
        ORNN_GPU_HISTORY_RANGE,
        params=params,
        path_params={"gpu_name": gpu_name},
        quiet_not_found=True,
    )
    if not data:
        return [], {}
    rows = data.get("data", data.get("history", []))
    query = data.get("query", {})
    records_found = query.get("records_found")
    if records_found and len(rows) < records_found:
        print(
            f"  WARNING {gpu_name}: got {len(rows)} rows but records_found={records_found}; "
            "may need a higher limit or smaller date chunks"
        )
    return rows, query


def get_gpu_history_full(
    gpu_name,
    start_date=ORNN_HISTORY_START_DATE,
    end_date=None,
    granularity="daily",
):
    """Fetch full available history, chunking by year to avoid the default row cap."""
    end_date = end_date or date.today().isoformat()
    all_rows = []
    queries = []
    seen = set()

    for chunk_start, chunk_end in _year_chunks(start_date, end_date):
        rows, query = get_gpu_history_range(
            gpu_name,
            start_date=chunk_start,
            end_date=chunk_end,
            granularity=granularity,
        )
        queries.append(query)
        for row in rows:
            ts = row.get("recorded_at") or row.get("timestamp") or row.get("date")
            if ts in seen:
                continue
            seen.add(ts)
            all_rows.append(row)

    all_rows.sort(key=lambda r: r.get("recorded_at") or r.get("timestamp") or r.get("date") or "")
    return all_rows, queries


def _fetch_chunked_series(gpu_name, path, extra_params=None):
    """Fetch a time-series endpoint in year chunks to avoid row caps."""
    end_date = date.today().isoformat()
    all_rows = []
    seen = set()

    for chunk_start, chunk_end in _year_chunks(ORNN_HISTORY_START_DATE, end_date):
        params = {
            "startDate": chunk_start,
            "endDate": chunk_end,
            "limit": ORNN_HISTORY_LIMIT,
        }
        if extra_params:
            params.update(extra_params)
        data = ornn_get(
            path,
            params=params,
            path_params={"gpu_name": gpu_name},
            quiet_not_found=True,
        )
        for row in (data.get("data", []) if data else []):
            ts = row.get("recorded_at") or row.get("timestamp") or row.get("date")
            if ts in seen:
                continue
            seen.add(ts)
            all_rows.append(row)

    all_rows.sort(key=lambda r: r.get("recorded_at") or r.get("timestamp") or r.get("date") or "")
    return all_rows


def get_gpu_volatility(
    gpu_name,
    start_date=ORNN_HISTORY_START_DATE,
    end_date=None,
    window_days=30,
    limit=ORNN_HISTORY_LIMIT,
):
    if start_date == ORNN_HISTORY_START_DATE and end_date is None:
        return _fetch_chunked_series(
            gpu_name,
            ORNN_GPU_VOLATILITY,
            extra_params={"windowDays": window_days},
        )

    params = {
        "startDate": start_date,
        "endDate": end_date or date.today().isoformat(),
        "windowDays": window_days,
        "limit": limit,
    }
    data = ornn_get(
        ORNN_GPU_VOLATILITY,
        params=params,
        path_params={"gpu_name": gpu_name},
    )
    return data.get("data", []) if data else []


def get_gpu_volume_metrics(
    gpu_name,
    start_date=ORNN_HISTORY_START_DATE,
    end_date=None,
    limit=ORNN_HISTORY_LIMIT,
):
    if start_date == ORNN_HISTORY_START_DATE and end_date is None:
        return _fetch_chunked_series(gpu_name, ORNN_GPU_VOLUME_METRICS)

    params = {
        "startDate": start_date,
        "endDate": end_date or date.today().isoformat(),
        "limit": limit,
    }
    data = ornn_get(
        ORNN_GPU_VOLUME_METRICS,
        params=params,
        path_params={"gpu_name": gpu_name},
    )
    return data.get("data", []) if data else []


def records_to_rows(gpu_name, records):
    """Preserve all API fields and add gpu_name."""
    rows = []
    for r in records:
        row = dict(r)
        row["gpu_name"] = gpu_name
        rows.append(row)
    return rows


# Backward-compatible alias used by the notebook
def history_to_rows(gpu_name, records):
    return records_to_rows(gpu_name, records)


def summarize_fields(rows):
    if not rows:
        return {}
    keys = sorted({k for row in rows for k in row})
    return {k: type(rows[0].get(k)).__name__ for k in keys}
