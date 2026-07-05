import { revalidatePath } from 'next/cache'
import { Bell, Clock3, Mail } from 'lucide-react'

import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
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
      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Tagesübersicht', value: enabled ? 'Aktiv' : 'Pausiert', tone: enabled ? 'success' : 'warning' },
          { label: 'Empfänger', value: email || 'Nicht gesetzt' },
          { label: 'Uhrzeit', value: `${hour}:00 Uhr` },
          { label: 'Zeitzone', value: tenant?.timezone ?? 'Europe/Berlin' },
        ]} />
      </div>
      <section className="panel max-w-3xl overflow-hidden" aria-labelledby="daily-digest">
        <div className="border-b border-vault-700 bg-vault-100 p-5 text-white sm:p-6">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
            <Bell className="h-4 w-4" aria-hidden="true" />
            E-Mail-Zusammenfassung
          </p>
          <h2 id="daily-digest" className="mt-2 text-xl font-bold">Deutsche Tagesübersicht</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">Erhalte täglich eine kompakte Übersicht über Preis-, Bestands- und Quellenereignisse.</p>
        </div>
        <div className="p-5 sm:p-7">
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
              <span className="field-label"><Mail className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Empfänger</span>
              <input className="field" type="email" name="daily_digest_email" required defaultValue={email} placeholder="einkauf@unternehmen.de" />
            </label>
            <label>
              <span className="field-label"><Clock3 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Lokale Uhrzeit</span>
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
        </div>
      </section>
    </>
  )
}
