import Link from 'next/link'
import { revalidatePath } from 'next/cache'

import { PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant } from '@/lib/backend'
import { formatRelativeTime } from '@/lib/utils'

type PrivacyRequest = {
  id: string
  request_type: 'export' | 'deletion'
  status: string
  requested_at: string
  completed_at?: string | null
  export_metadata?: Record<string, unknown>
}

async function requestExport() {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  const response = await backendFetch('/privacy/requests', tenant.id, {
    method: 'POST',
    body: JSON.stringify({ request_type: 'export' }),
  })
  if (!response.ok) return
  revalidatePath('/dashboard/settings/data-privacy')
}

async function requestDeletion(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return
  const response = await backendFetch('/privacy/requests', tenant.id, {
    method: 'POST',
    body: JSON.stringify({
      request_type: 'deletion',
      confirmation_text: String(formData.get('confirmation_text') ?? ''),
    }),
  })
  if (!response.ok) return
  revalidatePath('/dashboard/settings/data-privacy')
}

export default async function DataPrivacySettingsPage() {
  const tenant = await currentTenant()
  let requests: PrivacyRequest[] = []
  if (tenant) {
    try {
      const response = await backendFetch('/privacy/requests', tenant.id)
      if (response.ok) requests = (await response.json()) as PrivacyRequest[]
    } catch {
      requests = []
    }
  }
  const confirmation = tenant ? `DELETE ${tenant.shop_name}` : ''

  return (
    <>
      <PageHeader
        eyebrow="DSGVO"
        title="Daten & Datenschutz"
        description="Exportanfragen, Löschanfragen und rechtliche Unterlagen für deinen Mandanten."
      />

      {!tenant ? (
        <div className="panel p-6 text-sm text-amber-800">Für dieses Konto wurde noch kein Mandant eingerichtet.</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <section className="space-y-6">
            <div className="panel p-5">
              <p className="eyebrow">Export</p>
              <h2 className="mt-2 text-xl font-semibold">Mandantendaten anfordern</h2>
              <p className="mt-2 text-sm leading-6 text-vault-300">
                Erstellt eine protokollierte Anfrage für Produkt-, Quellen-, Alert- und Einstellungsdaten. Preisverläufe bleiben zusätzlich über CSV/PDF exportierbar.
              </p>
              <form action={requestExport} className="mt-5">
                <button className="button-primary">Exportanfrage stellen</button>
              </form>
            </div>

            <div className="panel border-l-4 border-l-red-500 p-5">
              <p className="eyebrow">Löschung</p>
              <h2 className="mt-2 text-xl font-semibold">Account- oder Mandantenlöschung anfragen</h2>
              <p className="mt-2 text-sm leading-6 text-vault-300">
                PriceVault löscht Produktionsdaten nicht automatisch. Die Anfrage wird mit Audit-Ereignis gespeichert und anschließend manuell geprüft.
              </p>
              <form action={requestDeletion} className="mt-5 space-y-3">
                <label className="block">
                  <span className="field-label">Bestätigung</span>
                  <input className="field" name="confirmation_text" placeholder={confirmation} required />
                </label>
                <button className="button-secondary">Löschanfrage bestätigen</button>
              </form>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="panel p-5">
              <h2 className="font-semibold">Rechtliche Links</h2>
              <div className="mt-4 grid gap-2 text-sm">
                <Link className="text-merchant-success hover:underline" href="/datenschutz">Datenschutz</Link>
                <Link className="text-merchant-success hover:underline" href="/dpa">DPA / AVV</Link>
                <Link className="text-merchant-success hover:underline" href="/widerruf">Kündigung & Widerruf</Link>
                <Link className="text-merchant-success hover:underline" href="/agb">AGB</Link>
              </div>
            </section>

            <section className="panel overflow-hidden">
              <div className="border-b border-vault-700 px-5 py-4 font-semibold">Anfragehistorie</div>
              <div className="divide-y divide-vault-700/70">
                {requests.map((request) => (
                  <article key={request.id} className="p-5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span>{request.request_type === 'export' ? 'Export' : 'Löschung'} · {request.status}</span>
                      <span className="font-mono text-xs text-vault-500">{formatRelativeTime(request.requested_at)}</span>
                    </div>
                  </article>
                ))}
                {!requests.length && <p className="p-5 text-sm text-vault-400">Noch keine Datenschutzanfragen.</p>}
              </div>
            </section>
          </aside>
        </div>
      )}
    </>
  )
}
