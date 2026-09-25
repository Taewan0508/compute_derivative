'use client'

import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from 'recharts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import type { GpuBasisCurve } from '@/lib/compute-data'

const TENORS = ['1M', '6M', '1Y', '3Y', '5Y']

function formatPct(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/**
 * Annualized basis table and chart for one GPU curve.
 *
 * GPU buttons switch `selected`. The table lists each tenor's forward price and
 * basis percent. The chart plots basis by tenor and draws a zero line. The chart
 * waits until after mount so Recharts measures a real container.
 *
 * @param props - Component props.
 * @param props.curves - Latest curve per GPU, already sorted for display.
 * @returns The GPU switcher, basis table, and area chart. Renders nothing useful when `curves` is empty.
 */
export function BasisPanel({ curves }: { curves: GpuBasisCurve[] }) {
  const [selected, setSelected] = useState(curves[0]?.gpuName ?? '')
  const active = curves.find((c) => c.gpuName === selected) ?? curves[0]
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const chartData = useMemo(() => {
    if (!active) return []
    return TENORS.map((tenor) => {
      const point = active.points.find((p) => p.tenor === tenor)
      return {
        tenor,
        basisPct: point?.basisPct ?? null,
        forwardPrice: point?.forwardPrice ?? null,
      }
    }).filter((d) => d.basisPct !== null)
  }, [active])

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border border-panel-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-panel-border hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                GPU
              </TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                Spot
              </TableHead>
              {TENORS.map((tenor) => (
                <TableHead
                  key={tenor}
                  className="text-right text-xs uppercase tracking-wide text-muted-foreground"
                >
                  {tenor}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {curves.map((curve) => (
              <TableRow
                key={curve.gpuName}
                onClick={() => setSelected(curve.gpuName)}
                className={cn(
                  'cursor-pointer border-panel-border transition-colors hover:bg-muted',
                  curve.gpuName === selected && 'bg-muted',
                )}
              >
                <TableCell className="font-medium text-foreground">{curve.gpuName}</TableCell>
                <TableCell className="text-right font-mono tabular text-foreground">
                  ${curve.spotPrice.toFixed(2)}
                </TableCell>
                {TENORS.map((tenor) => {
                  const point = curve.points.find((p) => p.tenor === tenor)
                  if (!point) {
                    return (
                      <TableCell key={tenor} className="text-right text-muted-foreground">
                        —
                      </TableCell>
                    )
                  }
                  return (
                    <TableCell
                      key={tenor}
                      className={cn(
                        'text-right font-mono tabular',
                        point.basisPct >= 0 ? 'text-positive' : 'text-negative',
                      )}
                    >
                      {formatPct(point.basisPct)}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {active && (
        <div className="rounded-lg border border-panel-border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-foreground">
              {active.gpuName} basis curve
            </h3>
            <span className="text-xs text-muted-foreground">
              as of {active.observationDate}
            </span>
          </div>
          {mounted ? (
            <ChartContainer
              config={{ basisPct: { label: 'Annualized basis', color: 'var(--chart-1)' } }}
              className="h-56 w-full"
            >
              <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="basisFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-basisPct)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-basisPct)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="tenor"
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
                <ReferenceLine y={0} stroke="var(--panel-border)" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${Number(value).toFixed(2)}%`}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="basisPct"
                  stroke="var(--color-basisPct)"
                  fill="url(#basisFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="h-56 w-full animate-pulse rounded-md bg-muted" />
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Annualized basis <code className="font-mono">ln(F/S) / T</code> between the Ornn
            forward mark and same-day spot index. Positive = contango (forward priced above
            spot), negative = backwardation.
          </p>
        </div>
      )}
    </div>
  )
}
