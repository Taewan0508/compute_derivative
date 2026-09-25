import {
  getBasisCurve,
  getGpuSnapshots,
  getSpotHistory,
  getActiveKalshiMarkets,
  sortByGpuOrder,
} from '@/lib/compute-data'
import { KpiStrip } from '@/components/dashboard/kpi-strip'
import { BasisPanel } from '@/components/dashboard/basis-panel'
import { SpotHistoryChart } from '@/components/dashboard/spot-history-chart'
import { KalshiPanel } from '@/components/dashboard/kalshi-panel'
import { BreakevenCalculator } from '@/components/dashboard/breakeven-calculator'

export default function Page() {
  const snapshots = sortByGpuOrder(getGpuSnapshots())
  const basisCurves = sortByGpuOrder(getBasisCurve())
  const spotHistory = getSpotHistory()
  const kalshiMarkets = getActiveKalshiMarkets()

  const latestObservation = basisCurves[0]?.observationDate ?? '—'

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2 border-b border-panel-border pb-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Ornn spot · Kalshi contracts
        </div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Compute Basis Terminal
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Annualized basis between Ornn GPU compute forward marks and the same-day spot index —
          <span className="font-mono"> ln(F/S) / T</span> — alongside the Kalshi contracts that
          settle against it. Latest observation:{' '}
          <span className="font-mono text-foreground">{latestObservation}</span>.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Spot index snapshot
        </h2>
        <KpiStrip snapshots={snapshots} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Annualized basis by tenor
        </h2>
        <BasisPanel curves={basisCurves} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Spot history
        </h2>
        <SpotHistoryChart points={spotHistory} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Breakeven calculator
        </h2>
        <BreakevenCalculator snapshots={snapshots} basisCurves={basisCurves} />
      </section>

      <section className="flex flex-col gap-3 pb-10">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Reference markets
        </h2>
        <KalshiPanel markets={kalshiMarkets} />
      </section>
    </main>
  )
}
