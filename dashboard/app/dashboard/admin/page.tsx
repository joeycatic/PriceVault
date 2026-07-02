import { backendFetch, currentTenant } from '@/lib/backend'
import { PageHeader } from '@/components/ui/MerchantUI'
import { formatRelativeTime } from '@/lib/utils'

type AdminIssue = {
  resource: string
  code?: string
  message: string
  details?: string
}

type AdminOverview = {
  tenants: any[]
  scrape_jobs: any[]
  report_runs: any[]
  connector_sync_runs: any[]
  audit_events: any[]
  access_issues?: AdminIssue[]
}

async function adminErrorMessage(response: Response) {
  let backendMessage = ''
  try {
    const payload = await response.json() as { detail?: string; message?: string }
    backendMessage = payload.detail ?? payload.message ?? ''
  } catch {
    backendMessage = ''
  }

  if (response.status === 403) return 'Support-Konsole ist für dieses Konto nicht freigeschaltet.'
  if (response.status === 401) return 'Deine Sitzung ist abgelaufen. Bitte neu einloggen.'
  return backendMessage || `Admin-Daten konnten nicht geladen werden (${response.status}).`
}

export default async function AdminPage() {
  const tenant = await currentTenant()
  let overview: AdminOverview | null = null
  let error = ''

  if (tenant) {
    try {
      const response = await backendFetch('/admin/overview?limit=20', tenant.id, {
        cache: 'no-store',
      })
      if (response.ok) overview = await response.json()
      else error = await adminErrorMessage(response)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Admin-Daten konnten nicht geladen werden.'
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Intern / Support"
        title="Support-Konsole"
        description="Platform-Admin-Bereich für Mandantenstatus, Jobs, Connectoren, Report-Läufe und Audit-Events."
      />

      {error ? (
        <section className="panel border-l-2 border-l-amber-300 p-6 text-sm text-amber-800">{error}</section>
      ) : (
        <>
          {overview?.access_issues?.length ? (
            <section className="panel mb-6 border-l-2 border-l-amber-300 p-5 text-sm text-amber-800">
              <p className="font-semibold">Einige Support-Daten sind im aktuellen Schema nicht verfügbar.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {overview.access_issues.map((issue) => (
                  <div key={issue.resource} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <span className="font-mono text-xs text-amber-800">{issue.resource}</span>
                    <p className="mt-1 text-vault-300">{issue.message}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            {[
              ['Mandanten', overview?.tenants ?? []],
              ['Scrape-Jobs', overview?.scrape_jobs ?? []],
              ['Report-Läufe', overview?.report_runs ?? []],
              ['Connector-Syncs', overview?.connector_sync_runs ?? []],
              ['Audit-Events', overview?.audit_events ?? []],
            ].map(([title, rows]) => (
              <section key={title as string} className="panel overflow-hidden">
                <div className="border-b border-vault-700 px-5 py-4">
                  <h2 className="text-base font-semibold">{title as string}</h2>
                </div>
                <div className="divide-y divide-vault-800">
                  {(rows as any[]).slice(0, 8).map((row, index) => (
                    <div key={row.id ?? `${title}-${index}`} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 text-sm">
                      <span className="truncate">{row.shop_name ?? row.action ?? row.status ?? row.id}</span>
                      <span className="font-mono text-xs text-vault-500">{row.created_at ? formatRelativeTime(row.created_at) : row.plan}</span>
                    </div>
                  ))}
                  {!(rows as any[]).length && <p className="px-5 py-8 text-sm text-vault-400">Keine Daten.</p>}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  )
}
