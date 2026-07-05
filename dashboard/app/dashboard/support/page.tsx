import { Activity, BookOpen, CreditCard, LifeBuoy, Send, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'

import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/utils'
import { SupportForm } from './SupportForm'

const topics = [
  {
    title: 'Scraping & Preisquellen',
    description: 'Fehlgeschlagene Abrufe, unerkannte Preise oder blockierte Produktseiten.',
    icon: Activity,
  },
  {
    title: 'Abrechnung & Plan',
    description: 'Fragen zu Tarif, Rechnung, Limits oder Zahlungsstatus.',
    icon: CreditCard,
  },
  {
    title: 'Konto & Zugriff',
    description: 'Anmeldung, Teamzugriff, Rollen oder sicherheitsrelevante Anliegen.',
    icon: ShieldCheck,
  },
]

const categoryLabels: Record<string, string> = {
  scraping: 'Scraping und Preisquellen',
  billing: 'Abrechnung und Tarif',
  account: 'Konto und Zugriff',
  general: 'Allgemein',
}

export default async function SupportPage() {
  const tenant = await currentTenant()
  const tenantName = tenant?.shop_name ?? 'Unbekanntes Unternehmen'
  const tenantId = tenant?.id ?? 'Nicht verfügbar'
  const supabase = await createClient()
  const { data: tickets } = tenant
    ? await supabase.from('support_tickets').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(10)
    : { data: [] }

  async function createTicket(formData: FormData) {
    'use server'
    if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    if (!user) return { ok: false, message: 'Deine Sitzung ist abgelaufen.' }
    const subject = String(formData.get('subject') ?? '').trim()
    const message = String(formData.get('message') ?? '').trim()
    if (!subject || message.length < 10) return { ok: false, message: 'Bitte ergänze Betreff und eine aussagekräftige Nachricht.' }
    const { error } = await client.from('support_tickets').insert({
      tenant_id: tenant.id,
      user_id: user.id,
      category: String(formData.get('category') ?? 'general'),
      subject,
      message,
    })
    if (error) return { ok: false, message: 'Die Anfrage konnte nicht gespeichert werden.' }
    revalidatePath('/dashboard/support')
    return { ok: true, message: 'Deine Anfrage wurde gespeichert.' }
  }

  return (
    <>
      <PageHeader
        eyebrow="Hilfe"
        title="Support"
        description="Direkter Kontakt für technische Fragen, Abrechnung und Kontozugriff."
      />

      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Offene Anfragen', value: (tickets ?? []).filter((ticket) => ticket.status === 'open').length, tone: (tickets ?? []).some((ticket) => ticket.status === 'open') ? 'warning' : 'success' },
          { label: 'In Bearbeitung', value: (tickets ?? []).filter((ticket) => ticket.status === 'in_progress').length },
          { label: 'Gelöst', value: (tickets ?? []).filter((ticket) => ticket.status === 'resolved').length, tone: 'success' },
          { label: 'Mandant', value: tenantName },
        ]} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel overflow-hidden" aria-labelledby="support-topics">
          <div className="border-b border-vault-700 bg-white px-5 py-4">
            <h2 id="support-topics" className="text-base font-semibold">Worum geht es?</h2>
            <p className="mt-1 text-sm text-vault-500">Wähle den passenden Bereich für deine Anfrage.</p>
          </div>
          <div className="divide-y divide-vault-700">
            {topics.map(({ title, description, icon: Icon }) => (
              <a
                key={title}
                href="#support-form"
                className="group grid gap-4 px-5 py-5 transition hover:bg-vault-950 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-vault-700 bg-white text-vault-400 group-hover:text-vault-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-vault-100">{title}</span>
                  <span className="mt-1 block text-sm leading-6 text-vault-500">{description}</span>
                </span>
                <span className="text-sm font-semibold text-merchant-success">Anfrage öffnen</span>
              </a>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="panel p-5" aria-labelledby="direct-contact">
            <LifeBuoy className="h-5 w-5 text-vault-500" aria-hidden="true" />
            <h2 id="direct-contact" className="mt-4 text-base font-semibold">Direkter Kontakt</h2>
            <p className="mt-3 text-sm text-vault-300">Anfragen werden direkt deinem Mandanten zugeordnet.</p>
            <dl className="mt-5 space-y-3 border-t border-vault-700 pt-4 text-xs">
              <div>
                <dt className="text-vault-500">Unternehmen</dt>
                <dd className="mt-1 font-medium text-vault-100">{tenantName}</dd>
              </div>
              <div>
                <dt className="text-vault-500">Mandant-ID</dt>
                <dd className="mt-1 break-all font-mono text-vault-300">{tenantId}</dd>
              </div>
            </dl>
          </section>

          <Link href="/dashboard/wiki" className="panel group flex items-start gap-4 p-5 transition hover:bg-vault-800">
            <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-vault-500 group-hover:text-vault-100" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-vault-100">PriceVault Referenz</span>
              <span className="mt-1 block text-sm leading-6 text-vault-500">Einrichtung, Preisquellen und Fehlerbehebung.</span>
            </span>
          </Link>
        </aside>
      </div>
      <section className="panel mt-6 overflow-hidden" aria-labelledby="new-ticket">
        <div className="border-b border-vault-700 bg-vault-100 p-5 text-white sm:p-6">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
            <Send className="h-4 w-4" aria-hidden="true" />
            Neue Anfrage
          </p>
          <h2 id="new-ticket" className="mt-2 text-xl font-bold">Support kontaktieren</h2>
        </div>
        <div className="p-5 sm:p-6">
        <SupportForm action={createTicket} />
        </div>
      </section>
      <section className="panel mt-6 overflow-hidden" aria-labelledby="ticket-history">
        <div className="border-b border-vault-700 bg-white px-5 py-4"><h2 id="ticket-history" className="font-semibold">Meine Anfragen</h2></div>
        <div className="divide-y divide-vault-700/70">
          {(tickets ?? []).map((ticket) => (
            <article key={ticket.id} className="flex flex-col gap-2 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{ticket.subject}</p><p className="mt-1 text-xs text-vault-500">{categoryLabels[ticket.category] ?? 'Allgemein'} · {formatRelativeTime(ticket.created_at)}</p></div>
              <span className="text-xs font-semibold text-vault-300">{ticket.status === 'open' ? 'Offen' : ticket.status === 'in_progress' ? 'In Bearbeitung' : ticket.status === 'resolved' ? 'Gelöst' : 'Geschlossen'}</span>
            </article>
          ))}
          {!(tickets ?? []).length && <p className="p-5 text-sm text-vault-400">Noch keine Support-Anfragen.</p>}
        </div>
      </section>
    </>
  )
}
