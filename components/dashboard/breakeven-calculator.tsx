'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { Slider } from '@/components/ui/slider'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { GPU_ORDER } from '@/lib/gpu-constants'
import {
  GPU_DEFAULTS,
  FINANCING_PRESETS,
  computeBreakevenSeries,
  priceAtMonths,
  type FinancingPreset,
  type PricePath,
} from '@/lib/breakeven'
import type { GpuBasisCurve, GpuSnapshot } from '@/lib/compute-data'

const TENOR_MONTHS: Record<string, number> = { '1M': 1, '6M': 6, '1Y': 12, '3Y': 36, '5Y': 60 }

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`
}

function pct(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`
}

/**
 * Interactive per-GPU ownership breakeven model.
 *
 * Seeds capex and TDP from {@link GPU_DEFAULTS} when a chip is selected, and
 * seeds the price path from that GPU's spot snapshot and Ornn basis curve.
 * Financing presets overwrite the rate. The chart and table come from
 * {@link computeBreakevenSeries}: yearly net margin, breakeven utilization,
 * and the price that breaks even at the assumed utilization.
 *
 * @param props - Component props.
 * @param props.snapshots - Latest spot, vol, and utilization per GPU. GPUs without a snapshot are omitted.
 * @param props.basisCurves - Latest forward curve per GPU, used when the price path is `curve`.
 * @returns The calculator controls, margin chart, and yearly table.
 */
export function BreakevenCalculator({
  snapshots,
  basisCurves,
}: {
  snapshots: GpuSnapshot[]
  basisCurves: GpuBasisCurve[]
}) {
  const gpuNames = useMemo(
    () => GPU_ORDER.filter((name) => snapshots.some((s) => s.gpuName === name)),
    [snapshots],
  )

  const [selectedGpu, setSelectedGpu] = useState(gpuNames[0] ?? '')
  const defaults = GPU_DEFAULTS[selectedGpu] ?? { capex: 30000, tdpWatts: 700 }

  const [capex, setCapex] = useState(defaults.capex)
  const [depYears, setDepYears] = useState(5)
  const [financing, setFinancing] = useState<FinancingPreset>('hyperscaler')
  const [rate, setRate] = useState<number>(FINANCING_PRESETS.hyperscaler)
  const [ltv, setLtv] = useState(75)
  const [tdp, setTdp] = useState(defaults.tdpWatts)
  const [pue, setPue] = useState(1.4)
  const [electricity, setElectricity] = useState(0.0917)
  const [opexPct, setOpexPct] = useState(40)
  const [utilPct, setUtilPct] = useState(75)
  const [pricePath, setPricePath] = useState<PricePath>('curve')
  const [flatPrice, setFlatPrice] = useState(2.5)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  function selectGpu(name: string) {
    setSelectedGpu(name)
    const d = GPU_DEFAULTS[name] ?? { capex: 30000, tdpWatts: 700 }
    setCapex(d.capex)
    setTdp(d.tdpWatts)
  }

  function selectFinancing(preset: FinancingPreset) {
    setFinancing(preset)
    if (preset === 'hyperscaler') setRate(FINANCING_PRESETS.hyperscaler)
    if (preset === 'unsecured') setRate(FINANCING_PRESETS.unsecured)
  }

  const curve = basisCurves.find((c) => c.gpuName === selectedGpu)
  const snapshot = snapshots.find((s) => s.gpuName === selectedGpu)

  const curvePoints = useMemo(() => {
    if (!curve) return []
    const points = [{ months: 0, price: curve.spotPrice }]
    for (const p of curve.points) {
      const months = TENOR_MONTHS[p.tenor]
      if (months) points.push({ months, price: p.forwardPrice })
    }
    return points
  }, [curve])

  const priceForYear = useMemo(() => {
    return (year: number) => {
      if (pricePath === 'flat') return flatPrice
      if (curvePoints.length === 0) return flatPrice
      return priceAtMonths(curvePoints, year * 12)
    }
  }, [pricePath, flatPrice, curvePoints])

  const series = useMemo(
    () =>
      computeBreakevenSeries({
        capex,
        depYears,
        ratePct: rate,
        ltvPct: ltv,
        tdpWatts: tdp,
        pue,
        electricityRate: electricity,
        opexPct,
        utilPct,
        priceForYear,
      }),
    [capex, depYears, rate, ltv, tdp, pue, electricity, opexPct, utilPct, priceForYear],
  )

  const year1 = series[0]
  const cushion = year1 ? utilPct - year1.breakevenUtilPct : 0
  const isHealthy = cushion >= 0

  const chartData = series.map((s) => ({
    year: `Yr ${s.year}`,
    breakevenUtilPct: Math.min(s.breakevenUtilPct, 200),
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-panel-border bg-card p-5">
        <div className="mb-4 flex flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">GPU data center breakeven</h3>
          <p className="font-mono text-xs text-muted-foreground">
            breakeven util = (power + depreciation + interest) / (price &times; 8,760hrs &times;
            (1 &minus; opex%))
          </p>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {gpuNames.map((name, i) => {
            const active = name === selectedGpu
            return (
              <button
                key={name}
                type="button"
                onClick={() => selectGpu(name)}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-panel-border text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: `var(--chart-${(i % 6) + 1})` }}
                />
                {name}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <FieldGroup title="Hardware">
            <SliderField
              label="Capex per GPU"
              value={capex}
              display={money(capex)}
              min={2000}
              max={65000}
              step={500}
              onChange={setCapex}
            />
            <SliderField
              label="Depreciation schedule"
              value={depYears}
              display={`${depYears} yr`}
              min={3}
              max={6}
              step={1}
              onChange={setDepYears}
            />
          </FieldGroup>

          <FieldGroup title="Financing">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Financing type</span>
              <div className="flex overflow-hidden rounded-md border border-panel-border">
                {(['hyperscaler', 'unsecured', 'custom'] as FinancingPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => selectFinancing(preset)}
                    className={cn(
                      'flex-1 px-2 py-1.5 text-xs font-medium transition-colors',
                      financing === preset
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {preset === 'hyperscaler' ? 'Hyperscaler' : preset === 'unsecured' ? 'Unsecured' : 'Custom'}
                  </button>
                ))}
              </div>
            </div>
            <SliderField
              label="Interest rate"
              value={rate}
              display={pct(rate)}
              min={2}
              max={16}
              step={0.1}
              onChange={(v) => {
                setRate(v)
                setFinancing('custom')
              }}
            />
            <SliderField
              label="Loan-to-value"
              value={ltv}
              display={pct(ltv, 0)}
              min={0}
              max={95}
              step={1}
              onChange={setLtv}
            />
          </FieldGroup>

          <FieldGroup title="Power">
            <SliderField
              label="TDP per GPU"
              value={tdp}
              display={`${tdp} W`}
              min={300}
              max={1500}
              step={10}
              onChange={setTdp}
            />
            <SliderField
              label="PUE (facility overhead)"
              value={pue}
              display={pue.toFixed(2)}
              min={1.05}
              max={1.6}
              step={0.01}
              onChange={setPue}
            />
            <SliderField
              label="Electricity"
              value={electricity}
              display={`$${electricity.toFixed(4)}/kWh`}
              min={0.04}
              max={0.2}
              step={0.001}
              onChange={setElectricity}
            />
          </FieldGroup>

          <FieldGroup title="Operating & utilization">
            <SliderField
              label="Opex, ex power/D&A/interest"
              value={opexPct}
              display={pct(opexPct, 0)}
              min={10}
              max={60}
              step={1}
              onChange={setOpexPct}
            />
            <SliderField
              label="Utilization assumption"
              value={utilPct}
              display={pct(utilPct, 0)}
              min={10}
              max={100}
              step={1}
              onChange={setUtilPct}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Price path</span>
              <div className="flex overflow-hidden rounded-md border border-panel-border">
                {(['curve', 'flat'] as PricePath[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPricePath(p)}
                    className={cn(
                      'flex-1 px-2 py-1.5 text-xs font-medium transition-colors',
                      pricePath === p
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p === 'curve' ? 'Tracked forward curve' : 'Flat rate'}
                  </button>
                ))}
              </div>
            </div>
            {pricePath === 'flat' && (
              <SliderField
                label="Flat price"
                value={flatPrice}
                display={`$${flatPrice.toFixed(2)}/hr`}
                min={0.2}
                max={10}
                step={0.01}
                onChange={setFlatPrice}
              />
            )}
          </FieldGroup>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Breakeven utilization (yr 1)"
          value={year1 ? pct(year1.breakevenUtilPct) : '—'}
          tone={year1 && year1.breakevenUtilPct <= utilPct ? 'good' : 'bad'}
          sub={year1 ? `at $${year1.price.toFixed(2)}/GPU-hr` : ''}
        />
        <Kpi
          label="Breakeven price at your utilization"
          value={year1 ? `$${year1.breakevenPriceAtUtil.toFixed(2)}` : '—'}
          tone={year1 && year1.breakevenPriceAtUtil <= year1.price ? 'good' : 'bad'}
          sub={`at ${utilPct}% utilization`}
        />
        <Kpi
          label="Net margin, year 1"
          value={year1 && year1.revenue > 0 ? pct((year1.netMargin / year1.revenue) * 100) : '—'}
          tone={year1 && year1.netMargin >= 0 ? 'good' : 'bad'}
          sub={year1 ? `${money(year1.netMargin)} / GPU / yr` : ''}
        />
        <Kpi
          label="Utilization cushion"
          value={year1 ? `${cushion >= 0 ? '+' : ''}${cushion.toFixed(1)}pp` : '—'}
          tone={isHealthy ? 'good' : 'bad'}
          sub={isHealthy ? 'above breakeven' : 'below breakeven'}
        />
      </div>

      <div className="rounded-lg border border-panel-border bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-foreground">
            Required utilization vs. your assumption
          </h3>
          <span className="text-xs text-muted-foreground">
            over the {depYears}-year depreciation horizon
          </span>
        </div>
        {mounted ? (
          <ChartContainer
            config={{ breakevenUtilPct: { label: 'Breakeven utilization', color: 'var(--chart-2)' } }}
            className="h-56 w-full"
          >
            <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={48}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickFormatter={(v) => `${v}%`}
              />
              <ReferenceLine
                y={utilPct}
                stroke="var(--foreground)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(value) => `${Number(value).toFixed(1)}%`} />}
              />
              <Bar dataKey="breakevenUtilPct" fill="var(--color-breakevenUtilPct)" radius={3} maxBarSize={48} />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="h-56 w-full animate-pulse rounded-md bg-muted" />
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-2)' }} />
            Utilization needed to break even
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-foreground" />
            Your utilization assumption ({utilPct}%)
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {pricePath === 'curve' && curve
            ? `Using ${selectedGpu}'s tracked forward curve (as of ${curve.observationDate}), the breakeven utilization required ${
                series.length > 1 && series[series.length - 1].breakevenUtilPct > year1?.breakevenUtilPct!
                  ? 'climbs'
                  : 'falls'
              } from ${year1 ? pct(year1.breakevenUtilPct) : '—'} in year 1 to ${
                series.length ? pct(series[series.length - 1].breakevenUtilPct) : '—'
              } by year ${depYears}, as forward pricing moves against the flat power, depreciation, and interest costs.`
            : `At a flat $${flatPrice.toFixed(2)}/GPU-hr, breakeven utilization holds steady at ${
                year1 ? pct(year1.breakevenUtilPct) : '—'
              } across the ${depYears}-year horizon since only depreciation shifts with fixed costs held flat.`}
        </p>

        <details className="mt-3">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
            Show year-by-year P&amp;L
          </summary>
          <div className="mt-2 overflow-hidden rounded-md border border-panel-border">
            <Table>
              <TableHeader>
                <TableRow className="border-panel-border hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Year</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Price/hr
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Revenue
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Power
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Deprec.
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Interest
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Opex
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Net margin
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                    Breakeven
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((s) => (
                  <TableRow key={s.year} className="border-panel-border">
                    <TableCell className="font-medium text-foreground">Year {s.year}</TableCell>
                    <TableCell className="text-right font-mono tabular text-foreground">
                      ${s.price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-foreground">
                      {money(s.revenue)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-foreground">
                      {money(s.power)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-foreground">
                      {money(s.depreciation)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-foreground">
                      {money(s.interest)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-foreground">
                      {money(s.opex)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono tabular',
                        s.netMargin >= 0 ? 'text-positive' : 'text-negative',
                      )}
                    >
                      {money(s.netMargin)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono tabular',
                        s.breakevenUtilPct <= utilPct ? 'text-positive' : 'text-negative',
                      )}
                    >
                      {pct(s.breakevenUtilPct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      </div>
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}

function SliderField({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium text-foreground">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: 'good' | 'bad'
}) {
  return (
    <div className="rounded-lg border border-panel-border bg-card p-4">
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-2xl font-semibold tabular-nums', tone === 'good' ? 'text-positive' : 'text-negative')}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
