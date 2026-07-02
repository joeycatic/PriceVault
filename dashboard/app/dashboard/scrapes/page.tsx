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

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Scraping / Health</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Scrape-Jobs</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Queue-, Retry- und Fehlerstatus fuer Preisquellen. Wiederholte Fehler landen im Support-Workflow.
        </p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          ['Jobs', rows.length],
          ['Aktiv', running],
          ['Fehlgeschlagen', failed],
        ].map(([label, value]) => (
          <div key={label} className="border border-vault-700 bg-vault-900/70 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-vault-500">{label}</p>
            <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-vault-700 text-[10px] uppercase tracking-[0.14em] text-vault-500">
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
                  <td className="px-5 py-4 font-mono text-xs">{row.state}</td>
                  <td className="max-w-[320px] truncate px-5 py-4 text-vault-300">{row.competitor_products?.competitor_url ?? row.competitor_product_id}</td>
                  <td className="px-5 py-4 font-mono">{row.retry_count}</td>
                  <td className="px-5 py-4 font-mono">{row.last_successful_price ?? '-'}</td>
                  <td className="max-w-[320px] truncate px-5 py-4 text-red-200">{row.failure_reason ?? '-'}</td>
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
