import { revalidatePath } from 'next/cache'
import Link from 'next/link'

import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan } from '@/lib/plan-gates'
import { formatPrice } from '@/lib/utils'

type MapViolation = {
  id: string
  detected_at: string
  map_price: number
  advertised_price: number
  status: 'open' | 'acknowledged' | 'resolved'
  products: { name: string } | null
  product_variants: { name: string; currency: string | null } | null
  competitor_products: {
    competitor_url: string
    competitors: { shop_name: string } | null
  } | null
}

async function updateViolation(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  const response = await backendFetch(`/map/violations/${String(formData.get('id'))}`, tenant.id, {
    method: 'PATCH',
    body: JSON.stringify({ status: String(formData.get('status')) }),
  })
  if (!response.ok) return
  revalidatePath('/dashboard/map')
}

export default async function MapPage() {
  const tenant = await currentTenant()
  const enabled = hasPlan(tenant?.plan, 'pro')
  let violations: MapViolation[] = []
  if (tenant && enabled) {
    const response = await backendFetch('/map/violations?status=open', tenant.id)
    if (response.ok) violations = await response.json()
  }

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="MAP-Überwachung"
        description="Offene Mindestwerbepreis-Verstöße mit Preis, Quelle und Nachweiszeitpunkt."
        actions={enabled ? <Link className="button-secondary" href="/api/map/violations/export">Als CSV exportieren</Link> : null}
      />

      {!enabled ? (
        <div className="panel border-l-2 border-l-merchant-success p-5 text-sm text-vault-300">
          Die MAP-Überwachung ist ab dem Pro-Plan verfügbar.
        </div>
      ) : (
        <>
          <div className="mb-6">
            <MetricGrid items={[
              { label: 'Offene Verstöße', value: violations.length, tone: violations.length ? 'danger' : 'success' },
              { label: 'Bestätigen', value: 'Auditfähig', detail: 'Status wird protokolliert' },
              { label: 'Export', value: 'CSV', detail: 'Für Nachverfolgung' },
              { label: 'Scope', value: 'Pro+', detail: 'Mandantengeschützt' },
            ]} />
          </div>

          <section className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-vault-700 text-sm">
                <thead className="bg-vault-950 text-left text-xs uppercase tracking-[0.08em] text-vault-500">
                  <tr>
                    <th className="px-5 py-3">Erkannt am</th>
                    <th className="px-5 py-3">Produkt</th>
                    <th className="px-5 py-3">Mitbewerber</th>
                    <th className="px-5 py-3">MAP-Preis</th>
                    <th className="px-5 py-3">Beworbener Preis</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vault-700">
                  {violations.map((violation) => (
                    <tr key={violation.id}>
                      <td className="px-5 py-4 font-mono text-xs text-vault-500">{new Date(violation.detected_at).toLocaleString('de-DE')}</td>
                      <td className="px-5 py-4">
                        <p className="font-semibold">{violation.products?.name ?? 'Produkt'}</p>
                        <p className="mt-1 text-xs text-vault-500">{violation.product_variants?.name ?? 'Variante'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <a className="font-semibold text-vault-100 hover:text-merchant-success" href={violation.competitor_products?.competitor_url} target="_blank" rel="noreferrer">
                          {violation.competitor_products?.competitors?.shop_name ?? 'Mitbewerber'}
                        </a>
                      </td>
                      <td className="px-5 py-4 font-mono">{formatPrice(violation.map_price, violation.product_variants?.currency ?? 'EUR')}</td>
                      <td className="px-5 py-4 font-mono text-red-700">{formatPrice(violation.advertised_price, violation.product_variants?.currency ?? 'EUR')}</td>
                      <td className="px-5 py-4">{violation.status === 'open' ? 'Offen' : violation.status === 'acknowledged' ? 'Bestätigt' : 'Erledigt'}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <form action={updateViolation}>
                            <input type="hidden" name="id" value={violation.id} />
                            <input type="hidden" name="status" value="acknowledged" />
                            <button className="button-secondary">Bestätigen</button>
                          </form>
                          <form action={updateViolation}>
                            <input type="hidden" name="id" value={violation.id} />
                            <input type="hidden" name="status" value="resolved" />
                            <button className="button-secondary">Erledigt</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!violations.length && (
                    <tr><td colSpan={7} className="px-5 py-6 text-vault-500">Keine offenen MAP-Verstöße.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  )
}
