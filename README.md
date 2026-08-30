# compute_derivative

Collecting data on GPU compute markets and their underlying index.

Kalshi lists event contracts on GPU compute prices (e.g. “Will B200 be above $9 by Oct 02?”). Those contracts settle against the [Ornn](https://dashboard.ornnai.com/compute) GPU compute price index ($/GPU-hour). This repo pulls both sides so they can be compared later — analysis and specific use cases are still TBD.

## Data sources

| Source | What it is | Auth |
|--------|------------|------|
| **Kalshi** | Binary yes/no contracts on compute price levels | Public API |
| **Ornn** | Spot / daily index for GPU compute ($/GPU-hour) | API key (Premium trial) |

## What's in `data/`

**Kalshi**
- `compute_markets_snapshot.csv` — market metadata (title, strike, status, bid/ask, etc.)
- `compute_markets_price_history.csv` — daily candlestick history for sampled markets
- `compute_prices_history.csv` — append-only price snapshots from the daily tracker

**Ornn** (6 GPUs: B200, H100 SXM, H200, A100 SXM4, RTX 5090, RTX PRO 6000 WS)
- `ornn_gpu_daily_history.csv` — full daily index history
- `ornn_daily_index_snapshot.csv` / `.json` — latest settled price per GPU
- `ornn_gpu_volatility.csv` — rolling volatility
- `ornn_gpu_volume_metrics.csv` — utilization ratios
- `ornn_forward_curves.csv` / `.json` — forward curve by tenor

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

For Ornn, add your API key to `.env`:

```
ORNN_API_KEY=sk_prem_...
```

## Pulling data

- **Notebook:** `tracker_testing.ipynb` — explore APIs and write CSVs to `data/`
- **Kalshi tracker:** `python src/compute_tracker.py` (also runs daily via GitHub Actions)
- **Ornn backfill:** `python src/ornn_backfill.py` — refresh all Ornn CSVs/JSONs

Paths are defined in `src/config.py`.
