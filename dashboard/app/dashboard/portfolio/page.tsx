import { BriefcaseBusiness } from 'lucide-react'

import { TenantOpenButton } from '@/components/ui/TenantSwitcher'
import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant, listTenantsForUser } from '@/lib/backend'

type PortfolioRow = {
  id: string
  shop_name: string
  plan: string
  products: number
  activeAlerts: number
  brokenSources: number
}

export default async function PortfolioPage() {
  const selectedTenant = await currentTenant()
  const tenants = await listTenantsForUser()

  if (selectedTenant?.plan !== 'agency') {
    return (
      <>
        <PageHeader
          eyebrow="Agency"
          title="Portfolio"
          description="Mandantenüberblick für Agenturen mit mehreren betreuten Shops."
        />
        <div className="panel border-l-2 border-l-merchant-success p-5 text-sm text-vault-300">
          Die Portfolio-Übersicht ist im Agency-Plan verfügbar.
        </div>
      </>
    )
  }

  const manageable = tenants.filter((tenant) => ['owner', 'admin', 'analyst'].includes(tenant.membership_role ?? 'owner'))
  const rows: PortfolioRow[] = await Promise.all(
    manageable.map(async (tenant) => {
      const [usageResponse, alertResult, sourceResult] = await Promise.all([
        backendFetch('/usage/summary', tenant.id).catch(() => null),
        backendFetch('/alerts', tenant.id).catch(() => null),
        backendFetch('/snapshots/latest', tenant.id).catch(() => null),
      ])
      const usage = usageResponse?.ok ? await usageResponse.json() : null
      const alerts = alertResult?.ok ? await alertResult.json() : []
      const latest = sourceResult?.ok ? await sourceResult.json() : []
      return {
        id: tenant.id,
        shop_name: tenant.shop_name,
        plan: tenant.plan,
        products: Number(usage?.measured?.products ?? 0),
        activeAlerts: alerts.filter((alert: { active?: boolean }) => alert.active).length,
        brokenSources: latest.filter((row: { health_status?: string }) => ['broken', 'blocked'].includes(row.health_status ?? '')).length,
      }
    }),
  )

  return (
    <>
      <PageHeader
        eyebrow="Agency"
        title="Portfolio"
        description="Alle betreuten Mandanten mit aktiven Produkten, Alarmen und defekten Quellen."
      />
      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Mandanten', value: rows.length, tone: 'success' },
          { label: 'Produkte', value: rows.reduce((sum, row) => sum + row.products, 0) },
          { label: 'Aktive Alarme', value: rows.reduce((sum, row) => sum + row.activeAlerts, 0), tone: 'warning' },
          { label: 'Defekte Quellen', value: rows.reduce((sum, row) => sum + row.brokenSources, 0), tone: rows.some((row) => row.brokenSources) ? 'danger' : 'success' },
        ]} />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <article key={row.id} className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Client</p>
                <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold">
                  <BriefcaseBusiness className="h-5 w-5 text-merchant-success" aria-hidden="true" />
                  {row.shop_name}
                </h2>
                <p className="mt-1 text-sm capitalize text-vault-500">{row.plan}</p>
              </div>
              <TenantOpenButton tenantId={row.id}>Öffnen</TenantOpenButton>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-vault-950 p-3">
                <dt className="text-xs text-vault-500">Produkte</dt>
                <dd className="mt-1 text-xl font-semibold">{row.products}</dd>
              </div>
              <div className="rounded-lg bg-vault-950 p-3">
                <dt className="text-xs text-vault-500">Aktive Alarme</dt>
                <dd className="mt-1 text-xl font-semibold">{row.activeAlerts}</dd>
              </div>
              <div className="rounded-lg bg-vault-950 p-3">
                <dt className="text-xs text-vault-500">Defekte Quellen</dt>
                <dd className="mt-1 text-xl font-semibold">{row.brokenSources}</dd>
              </div>
            </dl>
          </article>
        ))}
        {!rows.length && <div className="panel p-5 text-sm text-vault-500">Keine weiteren Mandanten sichtbar.</div>}
      </section>
    </>
  )
}
