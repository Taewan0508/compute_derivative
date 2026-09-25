'use client'

import { useEffect, useMemo, useState } from 'react'
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import type { SpotPoint } from '@/lib/compute-data'
import { GPU_ORDER } from '@/lib/gpu-constants'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

/**
 * Multi-series line chart of daily Ornn GPU spot prices.
 *
 * One line per GPU, colored in {@link GPU_ORDER}. Toggling a chip hides that
 * series. The chart waits until after mount so Recharts measures a real container.
 *
 * @param props - Component props.
 * @param props.points - Daily spot prints. Dates and GPU names are derived from these rows.
 * @returns Toggle buttons and the line chart.
 */
export function SpotHistoryChart({ points }: { points: SpotPoint[] }) {
  const gpuNames = useMemo(
    () =>
      Array.from(new Set(points.map((p) => p.gpuName))).sort(
        (a, b) => GPU_ORDER.indexOf(a) - GPU_ORDER.indexOf(b),
      ),
    [points],
  )
  const [active, setActive] = useState<Set<string>>(new Set(gpuNames))
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const config = useMemo(() => {
    const c: Record<string, { label: string; color: string }> = {}
    gpuNames.forEach((gpu, idx) => {
      c[gpu.replace(/\s+/g, '_')] = { label: gpu, color: CHART_COLORS[idx % CHART_COLORS.length] }
    })
    return c
  }, [gpuNames])

  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()
    for (const p of points) {
      if (!byDate.has(p.date)) byDate.set(p.date, { date: p.date })
      byDate.get(p.date)![p.gpuName.replace(/\s+/g, '_')] = p.price
    }
    return Array.from(byDate.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    )
  }, [points])

  function toggle(gpu: string) {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(gpu)) {
        if (next.size === 1) return prev
        next.delete(gpu)
      } else {
        next.add(gpu)
      }
      return next
    })
  }

  return (
    <div className="rounded-lg border border-panel-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">Spot index — $/GPU-hour</h3>
        <div className="flex flex-wrap gap-2">
          {gpuNames.map((gpu, idx) => (
            <button
              key={gpu}
              type="button"
              onClick={() => toggle(gpu)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                active.has(gpu)
                  ? 'border-panel-border bg-muted text-foreground'
                  : 'border-panel-border/50 text-muted-foreground',
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                  opacity: active.has(gpu) ? 1 : 0.35,
                }}
              />
              {gpu}
            </button>
          ))}
        </div>
      </div>
      {mounted ? (
        <ChartContainer config={config} className="h-72 w-full">
          <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
              minTickGap={40}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={44}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
            />
            <ChartTooltip content={<ChartTooltipContent labelKey="date" />} />
            {gpuNames
              .filter((g) => active.has(g))
              .map((gpu) => (
                <Line
                  key={gpu}
                  type="monotone"
                  dataKey={gpu.replace(/\s+/g, '_')}
                  name={gpu}
                  stroke={`var(--color-${gpu.replace(/\s+/g, '_')})`}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
          </LineChart>
        </ChartContainer>
      ) : (
        <div className="h-72 w-full animate-pulse rounded-md bg-muted" />
      )}
    </div>
  )
}
