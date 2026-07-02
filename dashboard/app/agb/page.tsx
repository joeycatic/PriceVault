import { legalInfo } from '@/lib/legal'

export default function TermsPage() {
  const legal = legalInfo()
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <p className="eyebrow">Terms</p>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">AGB / Terms</h1>
      <section className="panel mt-8 space-y-5 p-6 text-sm leading-7 text-vault-200">
        <p>Diese Bedingungen regeln die Nutzung von PriceVault durch gewerbliche Kunden.</p>
        <p>PriceVault stellt Software fuer Preisbeobachtung, Reports, Alerts und Integrationen bereit. Kunden sind fuer rechtmaessige Nutzung, eigene Zugangsdaten und eingegebene Inhalte verantwortlich.</p>
        <p>Verfuegbarkeit, Support, Zahlungsbedingungen, Laufzeiten und Planlimits ergeben sich aus dem gebuchten Tarif und der Checkout-Bestaetigung.</p>
        <p>Der Anbieter kann Funktionen aus Sicherheits-, Rechts- oder Betriebsgruenden anpassen, sofern der Vertragszweck erhalten bleibt.</p>
        <p>Kontakt fuer Vertragsfragen: <a className="text-vault-lime" href={`mailto:${legal.email}`}>{legal.email}</a>.</p>
      </section>
    </main>
  )
}
