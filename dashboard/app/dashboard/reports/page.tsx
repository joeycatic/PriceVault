import Link from 'next/link'

import { currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import type { LatestPrice } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

export default async function ReportsPage() {
  const tenant = await currentTenant()
  const supabase = await createClient()
  const [latestResult, schedulesResult, runsResult] = tenant
    ? await Promise.all([
        supabase
          .from('v_latest_prices')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('delta_pct', { ascending: true }),
        supabase
          .from('report_schedules')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('report_runs')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const latest = (latestResult.data ?? []) as LatestPrice[]
  const schedules = schedulesResult.data ?? []
  const runs = runsResult.data ?? []
  const undercut = latest.filter((row) => Number(row.delta_pct ?? 0) < 0)
  const unavailable = latest.filter((row) => row.in_stock === false)
  const volatile = latest.filter((row) => Math.abs(Number(row.delta_pct ?? 0)) >= 10)

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Reports / Automation</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Report-Zentrale</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Preisabweichungen, Export-Bereitschaft und geplante PDF/CSV-Reports fuer {tenant?.shop_name ?? 'deinen Shop'}.
        </p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Quellen', latest.length],
          ['Unterboten', undercut.length],
          ['Nicht verfuegbar', unavailable.length],
          ['Volatil >= 10%', volatile.length],
        ].map(([label, value]) => (
          <div key={label} className="border border-vault-700 bg-vault-900/70 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-vault-500">{label}</p>
            <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
        <section className="panel overflow-hidden" aria-labelledby="report-table">
          <div className="border-b border-vault-700 px-5 py-4">
            <h2 id="report-table" className="text-base font-semibold">Aktuelle Report-Zeilen</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-vault-700 text-[10px] uppercase tracking-[0.14em] text-vault-500">
                <tr>
                  <th className="px-5 py-3">Produkt</th>
                  <th className="px-5 py-3">Mitbewerber</th>
                  <th className="px-5 py-3">Preis</th>
                  <th className="px-5 py-3">Delta</th>
                  <th className="px-5 py-3">Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vault-800">
                {latest.slice(0, 40).map((row) => (
                  <tr key={row.competitor_product_id}>
                    <td className="px-5 py-4 font-medium">{row.product_name}</td>
                    <td className="px-5 py-4 text-vault-300">{row.competitor_shop}</td>
                    <td className="px-5 py-4 font-mono">{row.competitor_price ?? '-'}</td>
                    <td className="px-5 py-4 font-mono">{row.delta_pct ?? '-'}%</td>
                    <td className="px-5 py-4">
                      <Link className="text-vault-lime hover:underline" href={`/api/export/csv?competitor_product_id=${row.competitor_product_id}`}>
                        CSV
                      </Link>
                    </td>
                  </tr>
                ))}
                {!latest.length && (
                  <tr>
                    <td className="px-5 py-8 text-vault-400" colSpan={5}>Noch keine Reportdaten vorhanden.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-base font-semibold">Geplante Reports</h2>
            <div className="mt-4 space-y-3">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="border border-vault-800 p-3">
                  <p className="font-medium">{schedule.name}</p>
                  <p className="mt-1 text-xs text-vault-400">{schedule.cadence} · {schedule.include_csv ? 'PDF + CSV' : 'PDF'}</p>
                </div>
              ))}
              {!schedules.length && <p className="text-sm text-vault-400">Noch kein Zeitplan eingerichtet.</p>}
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-base font-semibold">Letzte Report-Laeufe</h2>
            <div className="mt-4 space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between border border-vault-800 p-3 text-sm">
                  <span>{run.status}</span>
                  <span className="font-mono text-xs text-vault-500">{formatRelativeTime(run.created_at)}</span>
                </div>
              ))}
              {!runs.length && <p className="text-sm text-vault-400">Noch kein Report versendet.</p>}
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
