from pathlib import Path

# --- Kalshi ---
BASE_KALSHI_URL = "https://external-api.kalshi.com/trade-api/v2"

KALSHI_SERIES = "/series"
KALSHI_MARKETS = "/markets"
KALSHI_MARKET = "/markets/{ticker}"
KALSHI_CANDLESTICKS = "/series/{series_ticker}/markets/{ticker}/candlesticks"
KALSHI_CANDLESTICKS_BATCH = "/markets/candlesticks"
KALSHI_TRADES = "/markets/trades"

KALSHI_REQUEST_TIMEOUT_SEC = 15
KALSHI_PAGE_LIMIT = 200
KALSHI_SERIES_MAX_PAGES = 5
KALSHI_CANDLE_PERIOD_MINUTE = 1
KALSHI_CANDLE_PERIOD_HOURLY = 60
KALSHI_CANDLE_PERIOD_DAILY = 1440

# --- Ornn (settlement / underlying compute prices) ---
BASE_ORNN_URL = "https://api.ornnai.com"
ORNN_DASHBOARD_URL = "https://dashboard.ornnai.com/compute"

ORNN_GPU_TYPES = "/api/gpu-types"
ORNN_GPU_TYPES_FREE = "/api/gpu-types-free"
ORNN_GPU_CURRENT = "/api/gpu/{gpu_name}"
ORNN_GPU_INDEX_HISTORY = "/api/gpu/{gpu_name}/index-history"
ORNN_GPU_HISTORY_RANGE = "/api/gpu/{gpu_name}/history-range"
ORNN_GPU_HISTORY_SIMPLE = "/api/gpu/{gpu_name}/history-simple"
ORNN_GPU_VOLATILITY = "/api/gpu/{gpu_name}/volatility"
ORNN_GPU_VOLUME_METRICS = "/api/gpu/{gpu_name}/volume-metrics"
ORNN_DAILY_INDEX = "/api/daily-index"
ORNN_DAILY_INDEX_ALL = "/api/daily-index/all"
ORNN_FORWARD = "/api/forward"
ORNN_OTPI = "/api/otpi"
ORNN_TOKEN_TYPES = "/api/token-types"
ORNN_TOKEN_VOLUME = "/api/token-volume"
ORNN_MEMORY_TYPES = "/api/memory-types"
ORNN_MEMORY_INDEX = "/api/memory-index"
ORNN_MEMORY_HISTORY = "/api/memory/{memory_type}/history"
ORNN_POWER_MARKETS = "/api/power/markets"
ORNN_MODEL_FRONTIER = "/api/model-frontier"
ORNN_COMPUTE_BUYERS = "/api/compute-buyers"

ORNN_REQUEST_TIMEOUT_SEC = 15
ORNN_CONNECT_TIMEOUT_SEC = 30
ORNN_READ_TIMEOUT_SEC = 60
ORNN_MAX_RETRIES = 3
ORNN_GPUS = ["B200", "H100 SXM", "H200", "A100 SXM4", "RTX 5090", "RTX PRO 6000 WS"]
ORNN_HISTORY_START_DATE = "2024-01-01"
ORNN_POWER_START_DATE = "2017-01-01"
ORNN_HISTORY_LIMIT = 10000  # API default is 100; Premium keys can request full history

# --- Tracker behavior ---
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"

# Kalshi outputs
KALSHI_PRICES_HISTORY_CSV = DATA_DIR / "compute_prices_history.csv"
KALSHI_MARKETS_SNAPSHOT_CSV = DATA_DIR / "compute_markets_snapshot.csv"
KALSHI_MARKETS_PRICE_HISTORY_CSV = DATA_DIR / "compute_markets_price_history.csv"

# Ornn outputs
ORNN_DAILY_INDEX_SNAPSHOT_CSV = DATA_DIR / "ornn_daily_index_snapshot.csv"
ORNN_DAILY_INDEX_SNAPSHOT_JSON = DATA_DIR / "ornn_daily_index_snapshot.json"
ORNN_GPU_DAILY_HISTORY_CSV = DATA_DIR / "ornn_gpu_daily_history.csv"
ORNN_GPU_VOLATILITY_CSV = DATA_DIR / "ornn_gpu_volatility.csv"
ORNN_GPU_VOLUME_METRICS_CSV = DATA_DIR / "ornn_gpu_volume_metrics.csv"
ORNN_FORWARD_CURVES_CSV = DATA_DIR / "ornn_forward_curves.csv"
ORNN_FORWARD_CURVES_JSON = DATA_DIR / "ornn_forward_curves.json"
ORNN_OTPI_HISTORY_CSV = DATA_DIR / "ornn_otpi_history.csv"
ORNN_MEMORY_INDEX_CSV = DATA_DIR / "ornn_memory_index.csv"
ORNN_MEMORY_HISTORY_CSV = DATA_DIR / "ornn_memory_history.csv"
ORNN_POWER_MARKETS_CSV = DATA_DIR / "ornn_power_markets.csv"
ORNN_TOKEN_TYPES_JSON = DATA_DIR / "ornn_token_types.json"
ORNN_MEMORY_TYPES_JSON = DATA_DIR / "ornn_memory_types.json"
ORNN_GPU_CURRENT_CSV = DATA_DIR / "ornn_gpu_current.csv"
ORNN_TOKEN_VOLUME_CSV = DATA_DIR / "ornn_token_volume.csv"
ORNN_MODEL_FRONTIER_JSON = DATA_DIR / "ornn_model_frontier.json"
ORNN_COMPUTE_BUYERS_CSV = DATA_DIR / "ornn_compute_buyers.csv"

KALSHI_CANDLES_MAX_DAYS_FALLBACK = 365 * 10  # if market has no open_time

OUTPUT_CSV = KALSHI_PRICES_HISTORY_CSV  # backward-compatible alias
SERIES_TICKER = None  # optional override; else keyword search
KEYWORDS = ["gpu", "compute", "b200", "h200", "a100", "h100", "nvidia"]


def ensure_data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


USER_AGENT = (
    "Mozilla/5.0 (compatible; ComputeTracker/1.0; "
    "+https://github.com/Taewan0508/compute_derivative)"
)


def kalshi_url(path: str, **path_params) -> str:
    return BASE_KALSHI_URL + path.format(**path_params)
