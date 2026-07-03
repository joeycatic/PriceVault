import { revalidatePath } from 'next/cache'

import { PageHeader } from '@/components/ui/MerchantUI'
import { currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'

export default async function NotificationSettingsPage() {
  const tenant = await currentTenant()
  const defaults = tenant?.notification_defaults ?? {}
  const enabled = defaults.daily_digest_enabled !== false
  const email = typeof defaults.daily_digest_email === 'string'
    ? defaults.daily_digest_email
    : tenant?.invoice_email ?? ''
  const hour = typeof defaults.daily_digest_hour === 'number' ? defaults.daily_digest_hour : 7

  async function saveDigest(formData: FormData) {
    'use server'
    if (!tenant) return
    const client = await createClient()
    await client
      .from('tenants')
      .update({
        notification_defaults: {
          ...defaults,
          daily_digest_enabled: formData.get('daily_digest_enabled') === 'on',
          daily_digest_email: String(formData.get('daily_digest_email') ?? '').trim(),
          daily_digest_hour: Number(formData.get('daily_digest_hour') ?? 7),
        },
      })
      .eq('id', tenant.id)
      .eq('user_id', tenant.user_id)
    revalidatePath('/dashboard/settings/notifications')
  }

  return (
    <>
      <PageHeader
        eyebrow="Einstellungen / Benachrichtigungen"
        title="Benachrichtigungen"
        description="Lege fest, wann und wohin PriceVault deine Tagesübersicht sendet."
      />
      <section className="panel max-w-3xl p-5 sm:p-7" aria-labelledby="daily-digest">
        <p className="eyebrow">E-Mail-Zusammenfassung</p>
        <h2 id="daily-digest" className="mt-2 text-xl font-semibold">Deutsche Tagesübersicht</h2>
        <form action={saveDigest} className="mt-6 space-y-5">
          <label className="flex items-start gap-3">
            <input className="mt-1 h-4 w-4" type="checkbox" name="daily_digest_enabled" defaultChecked={enabled} />
            <span>
              <span className="block text-sm font-semibold">Tagesübersicht senden</span>
              <span className="mt-1 block text-xs leading-5 text-vault-500">Enthält alle Preis-, Bestands- und Quellenereignisse seit der letzten Übersicht.</span>
            </span>
          </label>
          <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
            <label>
              <span className="field-label">Empfänger</span>
              <input className="field" type="email" name="daily_digest_email" required defaultValue={email} placeholder="einkauf@unternehmen.de" />
            </label>
            <label>
              <span className="field-label">Lokale Uhrzeit</span>
              <select className="field" name="daily_digest_hour" defaultValue={hour}>
                {[6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}:00 Uhr</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-vault-500">Zeitzone: {tenant?.timezone ?? 'Europe/Berlin'}</p>
          <div className="border-t border-vault-700 pt-5">
            <button className="button-primary">Einstellungen speichern</button>
          </div>
        </form>
      </section>
    </>
  )
}
