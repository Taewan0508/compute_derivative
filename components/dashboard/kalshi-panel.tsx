import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type React from 'react'
import type { KalshiMarket } from '@/lib/compute-data'

const formatDate = (iso: string): string => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const renderMarketRow = (market: KalshiMarket): React.JSX.Element => {
  return (
    <TableRow key={market.ticker} className="border-panel-border">
      <TableCell className="max-w-[280px]">
        <div className="flex flex-col gap-1">
          <span className="truncate text-sm text-foreground">{market.title}</span>
          <Badge
            variant="outline"
            className="w-fit border-panel-border font-mono text-[10px] text-muted-foreground"
          >
            {market.seriesTicker}
          </Badge>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono tabular text-foreground">
        ${market.floorStrike.toFixed(2)}
      </TableCell>
      <TableCell className="text-right font-mono tabular text-foreground">
        {(market.yesBid * 100).toFixed(0)}¢ / {(market.yesAsk * 100).toFixed(0)}¢
      </TableCell>
      <TableCell className="text-right font-mono tabular text-muted-foreground">
        {market.volume.toLocaleString()}
      </TableCell>
      <TableCell className="text-right font-mono tabular text-muted-foreground">
        {formatDate(market.closeTime)}
      </TableCell>
    </TableRow>
  )
}

/**
 * Table of the highest-volume active Kalshi compute contracts.
 *
 * Shows the top 12 markets by the order they are passed in (volume, descending,
 * from the loader). Columns are contract title, strike, yes bid/ask, last price,
 * volume, open interest, and close date. The header counts every market, not just the 12 shown.
 *
 * @param props - Component props.
 * @param props.markets - Active markets. Only the first 12 rows are rendered.
 * @returns The reference-market table.
 */
export const KalshiPanel = ({ markets }: { markets: KalshiMarket[] }): React.JSX.Element => {
  const top = markets.slice(0, 12)

  return (
    <div className="rounded-lg border border-panel-border bg-card">
      <div className="flex items-center justify-between border-b border-panel-border px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">
          Kalshi — active compute price contracts
        </h3>
        <span className="text-xs text-muted-foreground">{markets.length} live</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-panel-border hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              Contract
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
              Strike
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
              Yes bid/ask
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
              Volume
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">
              Closes
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {top.map((market) => renderMarketRow(market))}
        </TableBody>
      </Table>
    </div>
  )
}
