import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { KalshiMarket } from '@/lib/compute-data'

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function KalshiPanel({ markets }: { markets: KalshiMarket[] }) {
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
          {top.map((m) => (
            <TableRow key={m.ticker} className="border-panel-border">
              <TableCell className="max-w-[280px]">
                <div className="flex flex-col gap-1">
                  <span className="truncate text-sm text-foreground">{m.title}</span>
                  <Badge
                    variant="outline"
                    className="w-fit border-panel-border font-mono text-[10px] text-muted-foreground"
                  >
                    {m.seriesTicker}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular text-foreground">
                ${m.floorStrike.toFixed(2)}
              </TableCell>
              <TableCell className="text-right font-mono tabular text-foreground">
                {(m.yesBid * 100).toFixed(0)}¢ / {(m.yesAsk * 100).toFixed(0)}¢
              </TableCell>
              <TableCell className="text-right font-mono tabular text-muted-foreground">
                {m.volume.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-mono tabular text-muted-foreground">
                {formatDate(m.closeTime)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
