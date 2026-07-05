import { AlertTriangle, CheckCircle2, Clock3, Loader2, RotateCw } from 'lucide-react'

import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'

export default async function ScrapeJobsPage() {
  const tenant = await currentTenant()
  const supabase = await createClient()
  const { data: jobs } = tenant
    ? await supabase
        .from('scrape_jobs')
        .select('*, competitor_products(competitor_url)')
        .eq('tenant_id', tenant.id)
        .order('queued_at', { ascending: false })
        .limit(100)
    : { data: [] }

  const rows = jobs ?? []
  const failed = rows.filter((row) => row.state === 'failed').length
  const running = rows.filter((row) => row.state === 'running' || row.state === 'retrying').length
  const done = rows.filter((row) => row.state === 'done' || row.state === 'completed').length

  function statusBadge(state: string) {
    if (state === 'failed') return 'bg-red-50 text-red-700'
    if (state === 'running' || state === 'retrying') return 'bg-amber-50 text-amber-700'
    if (state === 'done' || state === 'completed') return 'bg-emerald-50 text-emerald-700'
    return 'bg-vault-800 text-vault-500'
  }

  function StatusIcon({ state }: { state: string }) {
    if (state === 'failed') return <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
    if (state === 'running') return <Loader2 className="h-3.5 w-3.5" aria-hidden="true" />
    if (state === 'retrying') return <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
    if (state === 'done' || state === 'completed') return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
    return <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
  }

  return (
    <>
      <PageHeader
        eyebrow="Scraping / Status"
        title="Scrape-Jobs"
        description="Queue-, Retry- und Fehlerstatus für Preisquellen. Wiederholte Fehler landen im Support-Workflow."
      />

      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Jobs', value: rows.length },
          { label: 'Aktiv', value: running, tone: running ? 'warning' : 'neutral' },
          { label: 'Fehlgeschlagen', value: failed, tone: failed ? 'danger' : 'success' },
          { label: 'Erfolgreich', value: done, tone: 'success' },
        ]} />
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-vault-700 bg-white px-5 py-4">
          <p className="eyebrow">Worker-Verlauf</p>
          <h2 className="mt-2 text-xl font-semibold">Letzte Scrape-Jobs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-vault-700 bg-vault-950 text-[10px] uppercase text-vault-500">
              <tr>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Quelle</th>
                <th className="px-5 py-3">Retry</th>
                <th className="px-5 py-3">Letzter Preis</th>
                <th className="px-5 py-3">Fehler</th>
                <th className="px-5 py-3">Zeit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vault-800">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadge(row.state)}`}>
                      <StatusIcon state={row.state} />
                      {row.state}
                    </span>
                  </td>
                  <td className="max-w-[320px] truncate px-5 py-4 text-vault-300">{row.competitor_products?.competitor_url ?? row.competitor_product_id}</td>
                  <td className="px-5 py-4 font-mono">{row.retry_count}</td>
                  <td className="px-5 py-4 font-mono">{row.last_successful_price ?? '-'}</td>
                  <td className="max-w-[320px] truncate px-5 py-4 text-red-800">{row.failure_reason ?? '-'}</td>
                  <td className="px-5 py-4 font-mono text-xs text-vault-500">{formatRelativeTime(row.queued_at)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-5 py-8 text-vault-400" colSpan={6}>Noch keine Scrape-Jobs aufgezeichnet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
