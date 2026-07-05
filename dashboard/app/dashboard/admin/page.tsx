import { Activity, Building2, Database, FileText, History, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { backendFetch, currentTenant } from '@/lib/backend'
import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
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

type Operations = {
  usage: Record<string, number>
  funnel: Record<string, number>
  reconciliations: Array<{ id: string; status: string; reconciliation_date: string }>
  plans: Record<string, { tenants: number; mrr_eur: number; estimated_cost_eur: number; estimated_gross_margin_eur: number }>
  cost_rates_configured: boolean
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
  let operations: Operations | null = null

  if (tenant) {
    try {
      const [response, operationsResponse] = await Promise.all([
        backendFetch('/admin/overview?limit=20', tenant.id, { cache: 'no-store' }),
        backendFetch('/admin/operations', tenant.id, { cache: 'no-store' }),
      ])
      if (response.ok) overview = await response.json()
      else error = await adminErrorMessage(response)
      if (operationsResponse.ok) operations = await operationsResponse.json()
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Admin-Daten konnten nicht geladen werden.'
    }
  }
  const supportSections: Array<{ title: string; rows: any[]; icon: LucideIcon }> = [
    { title: 'Mandanten', rows: overview?.tenants ?? [], icon: Building2 },
    { title: 'Scrape-Jobs', rows: overview?.scrape_jobs ?? [], icon: Activity },
    { title: 'Report-Läufe', rows: overview?.report_runs ?? [], icon: FileText },
    { title: 'Connector-Syncs', rows: overview?.connector_sync_runs ?? [], icon: Database },
    { title: 'Audit-Events', rows: overview?.audit_events ?? [], icon: History },
  ]

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

          <div className="mb-6">
            <MetricGrid items={[
              { label: 'Mandanten', value: overview?.tenants?.length ?? 0 },
              { label: 'Scrape-Jobs', value: overview?.scrape_jobs?.length ?? 0 },
              { label: 'Report-Läufe', value: overview?.report_runs?.length ?? 0 },
              { label: 'Audit-Events', value: overview?.audit_events?.length ?? 0 },
            ]} />
          </div>
          <section className="panel mb-6 overflow-hidden">
            <div className="border-b border-vault-700 bg-white px-5 py-4"><h2 className="font-semibold">Betrieb, Wachstum und Marge</h2><p className="mt-1 text-xs text-vault-500">Interne Kosten bleiben ausschließlich in dieser Operator-Ansicht.</p></div>
            {!operations?.cost_rates_configured && <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">Kostenraten sind noch nicht vollständig konfiguriert; Margenwerte sind nicht freigabefähig.</p>}
            <div className="grid gap-4 p-5 md:grid-cols-3">
              {Object.entries(operations?.plans ?? {}).map(([plan, values]) => <div key={plan} className="rounded-xl border border-vault-700 p-4"><p className="font-semibold capitalize">{plan}</p><p className="mt-3 text-2xl font-bold">{values.mrr_eur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p><p className="mt-1 text-xs text-vault-500">MRR · Kosten {values.estimated_cost_eur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} · Marge {values.estimated_gross_margin_eur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p></div>)}
            </div>
            <div className="grid gap-4 border-t border-vault-700 p-5 text-sm sm:grid-cols-2"><div><p className="font-semibold">Nutzung (30 Tage)</p><p className="mt-2 text-vault-500">Browser {operations?.usage.browser_seconds ?? 0} Sek. · LLM {operations?.usage.llm_calls ?? 0} · E-Mails {operations?.usage.emails ?? 0}</p></div><div><p className="font-semibold">Aktivierung und Bindung</p><p className="mt-2 text-vault-500">Aktiviert {operations?.funnel.first_validated_scrape ?? 0} · 7/30-Tage-Nutzung {operations?.funnel.weekly_retained_use ?? 0} · Quellenfehler {operations?.funnel.source_failure ?? 0}</p></div></div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            {supportSections.map(({ title, rows, icon: Icon }) => (
              <section key={title} className="panel overflow-hidden">
                <div className="border-b border-vault-700 bg-white px-5 py-4">
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Icon className="h-4 w-4 text-vault-500" aria-hidden="true" />
                    {title}
                  </h2>
                </div>
                <div className="divide-y divide-vault-800">
                  {rows.slice(0, 8).map((row, index) => (
                    <div key={row.id ?? `${title}-${index}`} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 text-sm transition hover:bg-vault-950">
                      <span className="truncate">{row.shop_name ?? row.action ?? row.status ?? row.id}</span>
                      <span className="font-mono text-xs text-vault-500">{row.created_at ? formatRelativeTime(row.created_at) : row.plan}</span>
                    </div>
                  ))}
                  {!rows.length && <p className="flex items-center gap-2 px-5 py-8 text-sm text-vault-400"><ShieldAlert className="h-4 w-4" aria-hidden="true" />Keine Daten.</p>}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  )
}
