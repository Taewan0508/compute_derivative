"""Plot Ornn GPU spot index series from data/ornn_gpu_daily_history.csv."""

from pathlib import Path

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd

from config import ORNN_GPU_DAILY_HISTORY_CSV, PROJECT_ROOT, ensure_data_dir


def run():
    ensure_data_dir()
    out_dir = PROJECT_ROOT / "data" / "plots"
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(ORNN_GPU_DAILY_HISTORY_CSV, parse_dates=["recorded_at"])
    gpus = sorted(df["gpu_name"].unique())

    fig, ax = plt.subplots(figsize=(11, 5.5))
    for gpu in gpus:
        g = df[df["gpu_name"] == gpu].sort_values("recorded_at")
        ax.plot(g["recorded_at"], g["index_value"], label=gpu, linewidth=1.4)
    ax.set_title("Ornn GPU spot index ($/GPU-hour)")
    ax.set_xlabel("Date")
    ax.set_ylabel("USD per GPU-hour")
    ax.legend(loc="upper left", frameon=False, ncol=2)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    ax.grid(True, alpha=0.25)
    fig.autofmt_xdate()
    fig.tight_layout()
    path_all = out_dir / "ornn_spot_all.png"
    fig.savefig(path_all, dpi=140)
    plt.close()

    fig, axes = plt.subplots(3, 2, figsize=(11, 9), sharex=False)
    for ax, gpu in zip(axes.ravel(), gpus):
        g = df[df["gpu_name"] == gpu].sort_values("recorded_at")
        ax.plot(g["recorded_at"], g["index_value"], color="#2563eb", linewidth=1.3)
        ax.set_title(f"{gpu}  ({g['recorded_at'].min().date()} → {g['recorded_at'].max().date()})")
        ax.set_ylabel("$/GPU-hr")
        ax.grid(True, alpha=0.25)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    fig.suptitle("Ornn spot price by GPU", y=1.01)
    fig.tight_layout()
    path_grid = out_dir / "ornn_spot_by_gpu.png"
    fig.savefig(path_grid, dpi=140, bbox_inches="tight")
    plt.close()

    print(f"→ {path_all.relative_to(PROJECT_ROOT)}")
    print(f"→ {path_grid.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    run()
