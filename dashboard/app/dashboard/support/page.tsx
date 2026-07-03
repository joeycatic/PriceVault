import { Activity, BookOpen, CreditCard, LifeBuoy, Mail, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/ui/MerchantUI'
import { currentTenant } from '@/lib/backend'

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@pricevault.de'

function supportHref(subject: string, tenantName: string, tenantId: string) {
  const params = new URLSearchParams({
    subject: `[PriceVault Support] ${subject}`,
    body: `Unternehmen: ${tenantName}\nMandant-ID: ${tenantId}\n\nAnliegen:\n`,
  })

  return `mailto:${supportEmail}?${params.toString()}`
}

const topics = [
  {
    title: 'Scraping & Preisquellen',
    description: 'Fehlgeschlagene Abrufe, unerkannte Preise oder blockierte Produktseiten.',
    subject: 'Scraping und Preisquellen',
    icon: Activity,
  },
  {
    title: 'Abrechnung & Plan',
    description: 'Fragen zu Tarif, Rechnung, Limits oder Zahlungsstatus.',
    subject: 'Abrechnung und Plan',
    icon: CreditCard,
  },
  {
    title: 'Konto & Zugriff',
    description: 'Anmeldung, Teamzugriff, Rollen oder sicherheitsrelevante Anliegen.',
    subject: 'Konto und Zugriff',
    icon: ShieldCheck,
  },
]

export default async function SupportPage() {
  const tenant = await currentTenant()
  const tenantName = tenant?.shop_name ?? 'Unbekanntes Unternehmen'
  const tenantId = tenant?.id ?? 'Nicht verfügbar'

  return (
    <>
      <PageHeader
        eyebrow="Hilfe"
        title="Support"
        description="Direkter Kontakt für technische Fragen, Abrechnung und Kontozugriff."
        actions={(
          <a
            href={supportHref('Allgemeine Anfrage', tenantName, tenantId)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-vault-100 px-4 py-2 text-sm font-semibold text-white transition hover:bg-vault-200"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            E-Mail schreiben
          </a>
        )}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel overflow-hidden" aria-labelledby="support-topics">
          <div className="border-b border-vault-700 px-5 py-4">
            <h2 id="support-topics" className="text-base font-semibold">Worum geht es?</h2>
            <p className="mt-1 text-sm text-vault-500">Wähle einen Bereich für eine vorausgefüllte Support-Anfrage.</p>
          </div>
          <div className="divide-y divide-vault-700">
            {topics.map(({ title, description, subject, icon: Icon }) => (
              <a
                key={title}
                href={supportHref(subject, tenantName, tenantId)}
                className="group grid gap-4 px-5 py-5 transition hover:bg-vault-800 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center"
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
            <a className="mt-3 block break-all text-sm font-semibold text-merchant-success" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
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
    </>
  )
}
