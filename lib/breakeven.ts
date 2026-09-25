// Client-safe breakeven math. No node:fs — safe to import into client components.

export interface GpuDefaults {
  capex: number
  tdpWatts: number
}

// Rough capex/TDP defaults by GPU generation. Used to seed the calculator when a
// GPU chip is selected; every value remains user-adjustable via the sliders.
export const GPU_DEFAULTS: Record<string, GpuDefaults> = {
  'B200': { capex: 52000, tdpWatts: 1000 },
  'H200': { capex: 41000, tdpWatts: 700 },
  'H100 SXM': { capex: 32000, tdpWatts: 700 },
  'A100 SXM4': { capex: 13000, tdpWatts: 400 },
  'RTX 5090': { capex: 3200, tdpWatts: 575 },
  'RTX PRO 6000 WS': { capex: 8500, tdpWatts: 600 },
}

export const FINANCING_PRESETS = {
  hyperscaler: 5.9,
  unsecured: 10,
} as const

export type FinancingPreset = 'hyperscaler' | 'unsecured' | 'custom'
export type PricePath = 'curve' | 'flat'

export interface CurvePoint {
  months: number
  price: number
}

/** Linear interpolation across sorted curve points; extrapolates past the last point using the final segment's slope. */
export function priceAtMonths(points: CurvePoint[], months: number): number {
  const sorted = [...points].sort((a, b) => a.months - b.months)
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0].price
  if (months <= sorted[0].months) return sorted[0].price

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (months <= b.months) {
      const t = (months - a.months) / (b.months - a.months)
      return a.price + t * (b.price - a.price)
    }
  }

  // Extrapolate beyond the last point using the slope of the final segment.
  const a = sorted[sorted.length - 2]
  const b = sorted[sorted.length - 1]
  const slope = (b.price - a.price) / (b.months - a.months)
  return b.price + slope * (months - b.months)
}

export interface BreakevenInputs {
  capex: number
  depYears: number
  ratePct: number
  ltvPct: number
  tdpWatts: number
  pue: number
  electricityRate: number
  opexPct: number
  utilPct: number
  priceForYear: (year: number) => number
}

export interface BreakevenYear {
  year: number
  price: number
  revenue: number
  power: number
  depreciation: number
  interest: number
  opex: number
  netMargin: number
  breakevenUtilPct: number
  breakevenPriceAtUtil: number
}

const HOURS_PER_YEAR = 8760

export function computeBreakevenSeries(inputs: BreakevenInputs): BreakevenYear[] {
  const { capex, depYears, ratePct, ltvPct, tdpWatts, pue, electricityRate, opexPct, utilPct, priceForYear } =
    inputs

  const debt = capex * (ltvPct / 100)
  const interest = debt * (ratePct / 100)
  const depreciation = capex / depYears
  const power = (tdpWatts / 1000) * pue * HOURS_PER_YEAR * electricityRate
  const opexFraction = opexPct / 100
  const util = utilPct / 100

  const years: BreakevenYear[] = []
  for (let year = 1; year <= depYears; year++) {
    const price = priceForYear(year)
    const revenue = price * HOURS_PER_YEAR * util
    const opex = revenue * opexFraction
    const netMargin = revenue - opex - power - depreciation - interest
    const fixedCosts = power + depreciation + interest
    const breakevenUtilPct =
      price > 0 && opexFraction < 1 ? (fixedCosts / (price * HOURS_PER_YEAR * (1 - opexFraction))) * 100 : 0
    const breakevenPriceAtUtil = util > 0 && opexFraction < 1 ? fixedCosts / (HOURS_PER_YEAR * util * (1 - opexFraction)) : 0

    years.push({
      year,
      price,
      revenue,
      power,
      depreciation,
      interest,
      opex,
      netMargin,
      breakevenUtilPct,
      breakevenPriceAtUtil,
    })
  }
  return years
}
