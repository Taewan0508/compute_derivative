import fs from 'node:fs'
import path from 'node:path'
import { parseCsv } from './csv'
import { GPU_ORDER, sortByGpuOrder } from './gpu-constants'

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

export interface BasisPoint {
  observationDate: string
  gpuName: string
  tenor: string
  months: number
  spotPrice: number
  forwardPrice: number
  basisPct: number
}

export interface GpuBasisCurve {
  gpuName: string
  observationDate: string
  spotPrice: number
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

export function getBasisHistory(): BasisPoint[] {
  return readCsv('compute_basis_history.csv')
    .map(toBasisPoint)
    .sort((a, b) => a.observationDate.localeCompare(b.observationDate))
}

export interface SpotPoint {
  date: string
  gpuName: string
  price: number
}

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

export interface GpuSnapshot {
  gpuName: string
  spotPrice: number
  volatility30d: number | null
  utilization: number | null
}

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

export interface KalshiMarket {
  seriesTicker: string
  ticker: string
  title: string
  status: string
  yesBid: number
  yesAsk: number
  lastPrice: number
  volume: number
  openInterest: number
  floorStrike: number
  closeTime: string
}

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
