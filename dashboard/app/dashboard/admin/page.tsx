import { backendFetch, currentTenant } from '@/lib/backend'
import { formatRelativeTime } from '@/lib/utils'

export default async function AdminPage() {
  const tenant = await currentTenant()
  let overview: any = null
  let error = ''

  if (tenant) {
    try {
      const response = await backendFetch('/admin/overview?limit=20', tenant.id, {
        cache: 'no-store',
      })
      if (response.ok) overview = await response.json()
      else error = 'Support-Konsole ist fuer dieses Konto nicht freigeschaltet.'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Admin-Daten konnten nicht geladen werden.'
    }
  }

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Internal / Support</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Support-Konsole</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Platform-Admin Bereich fuer Mandantenstatus, Jobs, Connectoren, Report-Laeufe und Audit-Events.
        </p>
      </header>

      {error ? (
        <section className="panel border-l-2 border-l-amber-300 p-6 text-sm text-amber-100">{error}</section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {[
            ['Mandanten', overview?.tenants ?? []],
            ['Scrape-Jobs', overview?.scrape_jobs ?? []],
            ['Report-Laeufe', overview?.report_runs ?? []],
            ['Audit-Events', overview?.audit_events ?? []],
          ].map(([title, rows]) => (
            <section key={title as string} className="panel overflow-hidden">
              <div className="border-b border-vault-700 px-5 py-4">
                <h2 className="text-base font-semibold">{title as string}</h2>
              </div>
              <div className="divide-y divide-vault-800">
                {(rows as any[]).slice(0, 8).map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 text-sm">
                    <span className="truncate">{row.shop_name ?? row.action ?? row.status ?? row.id}</span>
                    <span className="font-mono text-xs text-vault-500">{row.created_at ? formatRelativeTime(row.created_at) : row.plan}</span>
                  </div>
                ))}
                {!(rows as any[]).length && <p className="px-5 py-8 text-sm text-vault-400">Keine Daten.</p>}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
