import type { GpuSnapshot } from '@/lib/compute-data'
import { cn } from '@/lib/utils'

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`
}

export function KpiStrip({ snapshots }: { snapshots: GpuSnapshot[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-panel-border bg-panel-border sm:grid-cols-3 lg:grid-cols-6">
      {snapshots.map((s) => (
        <div key={s.gpuName} className="flex flex-col gap-2 bg-card px-4 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {s.gpuName}
          </span>
          <span className="font-mono text-xl font-semibold tabular text-foreground">
            {formatUsd(s.spotPrice)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">/hr</span>
          </span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {s.volatility30d !== null && (
              <span className="font-mono tabular">
                σ<sub className="font-sans">30d</sub> {s.volatility30d.toFixed(2)}
              </span>
            )}
            {s.utilization !== null && (
              <span
                className={cn(
                  'font-mono tabular',
                  s.utilization > 0.7 ? 'text-primary' : undefined,
                )}
              >
                util {Math.round(s.utilization * 100)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
