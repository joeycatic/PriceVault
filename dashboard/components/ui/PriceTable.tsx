'use client'

import { useMemo, useState } from 'react'

import type { LatestPrice } from '@/lib/types'
import { formatPrice, formatRelativeTime } from '@/lib/utils'
import { DeltaBadge } from './DeltaBadge'

function urgencyScore(row: LatestPrice) {
  return row.delta_pct === null ? Number.POSITIVE_INFINITY : Number(row.delta_pct)
}

export function PriceTable({ rows }: { rows: LatestPrice[] }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, LatestPrice[]>()
    rows.forEach((row) => {
      const current = grouped.get(row.product_id) ?? []
      current.push(row)
      grouped.set(row.product_id, current)
    })
    return Array.from(grouped.entries())
      .map(([productId, entries]) => ({
        productId,
        entries: entries.sort((a, b) => urgencyScore(a) - urgencyScore(b)),
      }))
      .sort((a, b) => urgencyScore(a.entries[0]) - urgencyScore(b.entries[0]))
  }, [rows])

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.map((group) => group.productId)),
  )

  function toggle(productId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })
  }

  if (!rows.length) {
    return (
      <div className="panel grid min-h-72 place-items-center px-6 text-center">
        <div>
          <p className="eyebrow">Noch keine Messwerte</p>
          <h2 className="mt-3 text-xl font-semibold">Die Preisübersicht ist noch leer.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-vault-300">
            Lege Produkte und Mitbewerber-Zuordnungen an. Nach dem ersten Abruf erscheinen die
            Preisunterschiede hier.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-vault-700 bg-vault-800/70 text-[10px] uppercase tracking-[0.14em] text-vault-500">
              <th className="px-5 py-4 font-semibold">Produkt</th>
              <th className="px-4 py-4 font-semibold">Dein Preis</th>
              <th className="px-4 py-4 font-semibold">Mitbewerber</th>
              <th className="px-4 py-4 font-semibold">Deren Preis</th>
              <th className="px-4 py-4 font-semibold">Differenz</th>
              <th className="px-4 py-4 font-semibold">Bestand</th>
              <th className="px-5 py-4 text-right font-semibold">Letzter Abruf</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ productId, entries }) => {
              const isOpen = expanded.has(productId)
              return entries.map((row, index) => {
                if (index > 0 && !isOpen) return null
                return (
                  <tr
                    key={row.competitor_product_id}
                    className="border-b border-vault-700/60 transition-colors last:border-0 hover:bg-vault-800/45"
                  >
                    <td className="px-5 py-5">
                      {index === 0 ? (
                        <button
                          type="button"
                          onClick={() => toggle(productId)}
                          className="flex items-center gap-3 text-left font-semibold text-vault-100"
                          aria-expanded={isOpen}
                        >
                          <span className="grid h-6 w-6 place-items-center border border-vault-700 font-mono text-xs text-vault-lime">
                            {isOpen ? '−' : '+'}
                          </span>
                          <span>
                            {row.product_name}
                            <span className="mt-1 block font-mono text-[10px] font-normal uppercase tracking-wider text-vault-500">
                              {entries.length} {entries.length === 1 ? 'Quelle' : 'Quellen'}
                            </span>
                          </span>
                        </button>
                      ) : (
                        <span className="pl-9 text-xs text-vault-500">↳ weitere Quelle</span>
                      )}
                    </td>
                    <td className="px-4 py-5 font-mono text-sm text-vault-300">
                      {formatPrice(row.our_price, row.our_currency)}
                    </td>
                    <td className="px-4 py-5">
                      <a
                        href={row.competitor_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium underline decoration-vault-700 underline-offset-4 hover:decoration-vault-lime"
                      >
                        {row.competitor_shop}
                      </a>
                    </td>
                    <td className="px-4 py-5 font-mono text-sm font-semibold">
                      {formatPrice(row.competitor_price, row.our_currency)}
                    </td>
                    <td className="px-4 py-5"><DeltaBadge value={row.delta_pct} /></td>
                    <td className="px-4 py-5">
                      <span className="inline-flex items-center gap-2 text-xs text-vault-300">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            row.in_stock === null
                              ? 'bg-vault-500'
                              : row.in_stock
                                ? 'bg-vault-lime shadow-[0_0_8px_rgba(180,240,0,.5)]'
                                : 'bg-red-400'
                          }`}
                        />
                        {row.in_stock === null ? 'Unbekannt' : row.in_stock ? 'Verfügbar' : 'Nicht verfügbar'}
                      </span>
                    </td>
                    <td className="px-5 py-5 text-right font-mono text-xs text-vault-500">
                      {formatRelativeTime(row.scraped_at)}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
