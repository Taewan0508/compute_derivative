'use client'

import { useMemo, useState } from 'react'
import { derivative, evaluate, simplify } from 'mathjs'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRESETS = [
  { label: 'x^3 + 2x^2', expr: 'x^3 + 2x^2' },
  { label: 'sin(x) * x', expr: 'sin(x) * x' },
  { label: 'e^x / x', expr: 'e^x / x' },
  { label: 'ln(x^2 + 1)', expr: 'ln(x^2 + 1)' },
]

type Result = {
  input: string
  variable: string
  derivativeExpr: string
  simplifiedExpr: string
  pointValue?: string
  pointError?: string
}

export function DerivativeCalculator() {
  const [expression, setExpression] = useState('x^3 + 2x^2')
  const [variable, setVariable] = useState('x')
  const [point, setPoint] = useState('1')
  const [error, setError] = useState<string | null>(null)

  const result = useMemo<Result | null>(() => {
    if (!expression.trim()) return null
    try {
      const derivativeNode = derivative(expression, variable)
      const simplified = simplify(derivativeNode)
      const derivativeExpr = derivativeNode.toString()
      const simplifiedExpr = simplified.toString()

      let pointValue: string | undefined
      let pointError: string | undefined
      if (point.trim() !== '') {
        try {
          const scope = { [variable]: evaluate(point) }
          const value = simplified.evaluate(scope)
          pointValue =
            typeof value === 'number' ? formatNumber(value) : String(value)
        } catch {
          pointError = 'Cannot evaluate at this point'
        }
      }

      setError(null)
      return {
        input: expression,
        variable,
        derivativeExpr,
        simplifiedExpr,
        pointValue,
        pointError,
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid expression')
      return null
    }
  }, [expression, variable, point])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 md:py-24">
      <header className="flex flex-col gap-2 border-b border-line pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-mono text-2xl font-medium tracking-tight text-foreground">
            d/d{variable}
          </h1>
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Symbolic Differentiation
          </span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Enter a function of {variable}. The engine computes its exact symbolic
          derivative and evaluates it at a chosen point.
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-md border border-panel-border bg-panel p-5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="expression"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
          >
            f({variable}) =
          </label>
          <input
            id="expression"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="e.g. x^3 + 2x^2"
            className="w-full rounded-sm border border-line bg-background px-3 py-2.5 font-mono text-base text-foreground outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="variable"
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
            >
              variable
            </label>
            <input
              id="variable"
              value={variable}
              onChange={(e) => setVariable(e.target.value.trim() || 'x')}
              maxLength={2}
              className="w-full rounded-sm border border-line bg-background px-3 py-2.5 font-mono text-base text-foreground outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="point"
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
            >
              evaluate at {variable} =
            </label>
            <input
              id="point"
              value={point}
              onChange={(e) => setPoint(e.target.value)}
              placeholder="1"
              className="w-full rounded-sm border border-line bg-background px-3 py-2.5 font-mono text-base text-foreground outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setExpression(preset.expr)}
              className={cn(
                'rounded-sm border border-line px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent',
                expression === preset.expr && 'border-accent text-accent',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-panel-border bg-panel px-4 py-3 text-sm text-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>{error}</span>
        </div>
      )}

      {result && !error && (
        <div className="flex flex-col gap-4 rounded-md border border-panel-border bg-panel p-5">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            <span>f({result.variable})</span>
            <ArrowRight className="size-3" />
            <span>f&apos;({result.variable})</span>
          </div>

          <div className="flex flex-col gap-1 border-b border-line pb-4">
            <span className="font-mono text-sm text-muted-foreground">
              {result.input}
            </span>
            <span className="font-mono text-2xl leading-tight text-accent break-all">
              {result.simplifiedExpr}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                unsimplified
              </span>
              <span className="break-all font-mono text-sm text-foreground">
                {result.derivativeExpr}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                f&apos;({point || result.variable})
              </span>
              {result.pointError ? (
                <span className="font-mono text-sm text-muted-foreground">
                  {result.pointError}
                </span>
              ) : (
                <span className="font-mono text-sm text-foreground">
                  {result.pointValue ?? '—'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="pt-2">
        <p className="font-mono text-xs text-muted-foreground">
          Computed client-side with symbolic differentiation. Not yet
          connected to a backend service.
        </p>
      </footer>
    </div>
  )
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toString()
  const rounded = Math.round(value * 1e6) / 1e6
  return rounded.toString()
}
