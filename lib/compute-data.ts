import fs from 'node:fs'
import path from 'node:path'
import { parseCsv } from './csv'
import { GPU_ORDER, sortByGpuOrder } from './gpu-constants'

/**
 * Re-exports {@link GPU_ORDER} and {@link sortByGpuOrder}.
 *
 * Server components import ordering from this module so client charts can keep
 * importing `@/lib/gpu-constants` without pulling in `node:fs`.
 */
export { GPU_ORDER, sortByGpuOrder }

const DATA_DIR = path.join(process.cwd(), 'data', 'csvs')

const TENOR_ORDER = ['1M', '6M', '1Y', '3Y', '5Y']

function readCsv(filename: string): Record<string, string>[] {
  const filePath = path.join(DATA_DIR, filename)
  if (!fs.existsSync(filePath)) return []
  const text = fs.readFileSync(filePath, 'utf-8')
  return parseCsv(text)
}

function num(value: string | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * One annualized basis observation, `ln(forward / spot) / T`, for a GPU and tenor.
 */
export interface BasisPoint {
  /** Calendar day the spot index and forward mark were joined, `YYYY-MM-DD`. */
  observationDate: string
  /** Ornn GPU series name, for example `H100 SXM`. */
  gpuName: string
  /** Tenor label: `1M`, `6M`, `1Y`, `3Y`, or `5Y`. */
  tenor: string
  /** Tenor length in months. Years used in the basis formula are `months / 12`. */
  months: number
  /** Same-day Ornn spot index, in dollars per GPU-hour. */
  spotPrice: number
  /** Published Ornn forward mark for this tenor, in dollars per GPU-hour. */
  forwardPrice: number
  /** Annualized basis in percent. Negative values are backwardation. */
  basisPct: number
}

/**
 * Latest forward curve for one GPU, with one point per tenor.
 */
export interface GpuBasisCurve {
  /** Ornn GPU series name. */
  gpuName: string
  /** Observation date shared by every point on this curve. */
  observationDate: string
  /** Same-day spot used as `S` for every tenor, in dollars per GPU-hour. */
  spotPrice: number
  /** Curve points sorted `1M`, `6M`, `1Y`, `3Y`, `5Y`. */
  points: { tenor: string; months: number; forwardPrice: number; basisPct: number }[]
}

function toBasisPoint(row: Record<string, string>): BasisPoint {
  return {
    observationDate: row.observation_date,
    gpuName: row.gpu_name,
    tenor: row.label,
    months: num(row.months),
    spotPrice: num(row.spot_price),
    forwardPrice: num(row.forward_price),
    basisPct: num(row.basis_annualized_pct),
  }
}

/**
 * Loads the latest same-day basis curve.
 *
 * Reads `data/csvs/compute_basis_curve.csv`, groups rows by GPU, and sorts each
 * curve's tenors from 1 month to 5 years. A missing file returns `[]`.
 *
 * @returns One curve per GPU present in the CSV, sorted by GPU name.
 */
export function getBasisCurve(): GpuBasisCurve[] {
  const rows = readCsv('compute_basis_curve.csv').map(toBasisPoint)
  const byGpu = new Map<string, BasisPoint[]>()
  for (const row of rows) {
    if (!byGpu.has(row.gpuName)) byGpu.set(row.gpuName, [])
    byGpu.get(row.gpuName)!.push(row)
  }
  return Array.from(byGpu.entries())
    .map(([gpuName, points]) => ({
      gpuName,
      observationDate: points[0]?.observationDate ?? '',
      spotPrice: points[0]?.spotPrice ?? 0,
      points: points
        .map((p) => ({ tenor: p.tenor, months: p.months, forwardPrice: p.forwardPrice, basisPct: p.basisPct }))
        .sort((a, b) => TENOR_ORDER.indexOf(a.tenor) - TENOR_ORDER.indexOf(b.tenor)),
    }))
    .sort((a, b) => a.gpuName.localeCompare(b.gpuName))
}

/**
 * Loads every archived basis observation.
 *
 * Reads `data/csvs/compute_basis_history.csv`. Each row is one GPU, tenor, and
 * observation date from a previous forward-curve pull. A missing file returns `[]`.
 *
 * @returns Basis points sorted by observation date, oldest first.
 */
export function getBasisHistory(): BasisPoint[] {
  return readCsv('compute_basis_history.csv')
    .map(toBasisPoint)
    .sort((a, b) => a.observationDate.localeCompare(b.observationDate))
}

/**
 * One daily Ornn spot print.
 */
export interface SpotPoint {
  /** Calendar day of the print, `YYYY-MM-DD`, taken from `recorded_at`. */
  date: string
  /** Ornn GPU series name. */
  gpuName: string
  /** Spot index level, `index_value`, in dollars per GPU-hour. */
  price: number
}

/**
 * Loads daily GPU spot history.
 *
 * Reads `data/csvs/ornn_gpu_daily_history.csv` and keeps one price per GPU per
 * calendar day. Duplicate timestamps on the same day keep the last row in the file.
 *
 * @returns Spot points sorted by date, oldest first. A missing file returns `[]`.
 */
export function getSpotHistory(): SpotPoint[] {
  const rows = readCsv('ornn_gpu_daily_history.csv')
  const byGpuDay = new Map<string, SpotPoint>()
  for (const row of rows) {
    const date = (row.recorded_at || '').slice(0, 10)
    if (!date) continue
    const key = `${row.gpu_name}__${date}`
    byGpuDay.set(key, { date, gpuName: row.gpu_name, price: num(row.index_value) })
  }
  return Array.from(byGpuDay.values()).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Latest spot, 30-day volatility, and utilization for one GPU.
 */
export interface GpuSnapshot {
  /** Ornn GPU series name. */
  gpuName: string
  /** Most recent daily spot, in dollars per GPU-hour. */
  spotPrice: number
  /** Latest 30-day rolling volatility, or `null` when that GPU has no vol row. */
  volatility30d: number | null
  /** Latest utilization ratio from 0 to 1, or `null` when volume metrics are missing. */
  utilization: number | null
}

/**
 * Builds one snapshot per GPU that has spot history.
 *
 * Spot comes from the last daily print. Volatility is the last `rolling_volatility`
 * in `ornn_gpu_volatility.csv`. Utilization is the last `utilization_ratio` in
 * `ornn_gpu_volume_metrics.csv`.
 *
 * @returns Snapshots sorted by spot price, highest first.
 */
export function getGpuSnapshots(): GpuSnapshot[] {
  const spot = getSpotHistory()
  const latestSpot = new Map<string, SpotPoint>()
  for (const p of spot) {
    latestSpot.set(p.gpuName, p) // spot is sorted ascending, so last write wins = latest
  }

  const volRows = readCsv('ornn_gpu_volatility.csv')
  const latestVol = new Map<string, number>()
  for (const row of volRows) {
    if (row.rolling_volatility) latestVol.set(row.gpu_name, num(row.rolling_volatility))
  }

  const volumeRows = readCsv('ornn_gpu_volume_metrics.csv')
  const latestUtil = new Map<string, number>()
  for (const row of volumeRows) {
    if (row.utilization_ratio) latestUtil.set(row.gpu_name, num(row.utilization_ratio))
  }

  return Array.from(latestSpot.entries())
    .map(([gpuName, point]) => ({
      gpuName,
      spotPrice: point.price,
      volatility30d: latestVol.get(gpuName) ?? null,
      utilization: latestUtil.get(gpuName) ?? null,
    }))
    .sort((a, b) => b.spotPrice - a.spotPrice)
}

/**
 * One Kalshi compute contract from the latest market snapshot.
 */
export interface KalshiMarket {
  /** Parent series ticker, for example a compute-price series. */
  seriesTicker: string
  /** Market ticker for this contract. */
  ticker: string
  /** Human-readable contract title from Kalshi. */
  title: string
  /** Market status. The loader keeps rows whose status is `active`. */
  status: string
  /** Best yes bid, in dollars from 0 to 1. */
  yesBid: number
  /** Best yes ask, in dollars from 0 to 1. */
  yesAsk: number
  /** Last traded yes price, in dollars from 0 to 1. */
  lastPrice: number
  /** Contracts traded. Used to rank the table. */
  volume: number
  /** Open interest, in contracts. */
  openInterest: number
  /** Strike or floor strike the contract pays out above. */
  floorStrike: number
  /** ISO timestamp when the market closes. */
  closeTime: string
}

/**
 * Loads active Kalshi compute markets.
 *
 * Reads `data/csvs/compute_markets_snapshot.csv` and drops any row whose
 * `status` is not `active`.
 *
 * @returns Active markets sorted by volume, highest first. A missing file returns `[]`.
 */
export function getActiveKalshiMarkets(): KalshiMarket[] {
  const rows = readCsv('compute_markets_snapshot.csv')
  return rows
    .filter((row) => row.status === 'active')
    .map((row) => ({
      seriesTicker: row.series_ticker,
      ticker: row.market_ticker,
      title: row.title,
      status: row.status,
      yesBid: num(row.yes_bid),
      yesAsk: num(row.yes_ask),
      lastPrice: num(row.last_price),
      volume: num(row.volume),
      openInterest: num(row.open_interest),
      floorStrike: num(row.floor_strike),
      closeTime: row.close_time,
    }))
    .sort((a, b) => b.volume - a.volume)
}
