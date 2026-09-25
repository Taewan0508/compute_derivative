// Client-safe breakeven math. No node:fs — safe to import into client components.

/**
 * Capex and thermal defaults used to seed the breakeven calculator.
 */
export interface GpuDefaults {
  /** Purchase price of one GPU, in dollars. */
  capex: number
  /** Board power draw, in watts, before PUE. */
  tdpWatts: number
}

// Rough capex/TDP defaults by GPU generation. Used to seed the calculator when a
// GPU chip is selected; every value remains user-adjustable via the sliders.
/**
 * Rough capex and TDP keyed by Ornn GPU name.
 *
 * These only seed the calculator when a chip is selected. Every value stays
 * adjustable on the sliders. Figures are order-of-magnitude street prices,
 * not quotes.
 */
export const GPU_DEFAULTS: Record<string, GpuDefaults> = {
  'B200': { capex: 52000, tdpWatts: 1000 },
  'H200': { capex: 41000, tdpWatts: 700 },
  'H100 SXM': { capex: 32000, tdpWatts: 700 },
  'A100 SXM4': { capex: 13000, tdpWatts: 400 },
  'RTX 5090': { capex: 3200, tdpWatts: 575 },
  'RTX PRO 6000 WS': { capex: 8500, tdpWatts: 600 },
}

/**
 * Annual interest rates, in percent, for the two named financing presets.
 *
 * `hyperscaler` is 5.9. `unsecured` is 10. Choosing either preset in the
 * calculator overwrites the rate slider; `custom` leaves the slider alone.
 */
export const FINANCING_PRESETS = {
  hyperscaler: 5.9,
  unsecured: 10,
} as const

/**
 * Financing source selected in the calculator.
 *
 * `hyperscaler` and `unsecured` lock the annual rate to {@link FINANCING_PRESETS}.
 * `custom` keeps whatever rate is on the slider.
 */
export type FinancingPreset = 'hyperscaler' | 'unsecured' | 'custom'

/**
 * How each year's revenue price is chosen.
 *
 * `curve` interpolates the Ornn forward marks with {@link priceAtMonths}.
 * `flat` holds every year at the latest spot.
 */
export type PricePath = 'curve' | 'flat'

/**
 * One point on a forward price curve.
 */
export interface CurvePoint {
  /** Tenor of this mark, in months from the observation date. */
  months: number
  /** Mark price, in dollars per GPU-hour. */
  price: number
}

/**
 * Price on a forward curve at an arbitrary month.
 *
 * Points are sorted by `months` before interpolation. Before the first point
 * the first price is used. Between points the price is linear in months.
 * Past the last point the slope of the final segment is extended.
 * An empty curve returns `0`. A single point returns that price for every month.
 *
 * @param points - Forward marks. Order does not matter.
 * @param months - Tenor to evaluate, in months.
 * @returns Interpolated price, in dollars per GPU-hour.
 */
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

/**
 * Inputs to the yearly breakeven projection.
 *
 * Dollar amounts are per GPU. Rates and percentages are in percent, not fractions,
 * except where a field name says otherwise.
 */
export interface BreakevenInputs {
  /** Purchase price of the GPU, in dollars. */
  capex: number
  /** Straight-line depreciation life, in years. Also the number of years returned. */
  depYears: number
  /** Annual interest rate on the debt portion, in percent. */
  ratePct: number
  /** Share of capex that is financed, in percent. Equity is the remainder. */
  ltvPct: number
  /** Board power, in watts, before PUE. */
  tdpWatts: number
  /** Power usage effectiveness. `1.2` means 20% overhead above the board. */
  pue: number
  /** Electricity price, in dollars per kWh. */
  electricityRate: number
  /** Operating costs other than power, as a percent of revenue. */
  opexPct: number
  /** Assumed utilization of the 8,760 hours in a year, in percent. */
  utilPct: number
  /** Revenue price for a 1-based year index, in dollars per GPU-hour. */
  priceForYear: (year: number) => number
}

/**
 * One year of the breakeven projection.
 *
 * Revenue and costs are dollars per GPU for that year. Power, depreciation, and
 * interest do not depend on utilization, so they repeat across years.
 */
export interface BreakevenYear {
  /** 1-based year of the asset life. */
  year: number
  /** Revenue price used for this year, in dollars per GPU-hour. */
  price: number
  /** `price * 8760 * utilization`. */
  revenue: number
  /** `(tdpWatts / 1000) * pue * 8760 * electricityRate`. */
  power: number
  /** `capex / depYears`. */
  depreciation: number
  /** `capex * (ltvPct / 100) * (ratePct / 100)`. */
  interest: number
  /** `revenue * (opexPct / 100)`. */
  opex: number
  /** Revenue minus opex, power, depreciation, and interest. */
  netMargin: number
  /** Utilization, in percent, that sets net margin to zero at this year's price. */
  breakevenUtilPct: number
  /** Price, in dollars per GPU-hour, that sets net margin to zero at the assumed utilization. */
  breakevenPriceAtUtil: number
}

const HOURS_PER_YEAR = 8760

/**
 * Projects margin and breakeven levels for each year of the depreciation life.
 *
 * Debt is `capex * ltv`. Interest and straight-line depreciation are constant.
 * Power assumes 8,760 hours and does not scale with utilization. Breakeven
 * utilization and breakeven price are `0` when price or utilization is zero,
 * or when opex is 100% or more of revenue.
 *
 * @param inputs - Capex, financing, power, and a price function. See {@link BreakevenInputs}.
 * @returns One {@link BreakevenYear} per year, from 1 through `depYears`.
 */
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
