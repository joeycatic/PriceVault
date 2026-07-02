import { LegalPageLayout } from '@/components/ui/PublicChrome'
import { legalInfo } from '@/lib/legal'

export default function TermsPage() {
  const legal = legalInfo()
  return (
    <LegalPageLayout eyebrow="Vertrag" title="AGB / Terms">
        <p>Diese Bedingungen regeln die Nutzung von PriceVault durch gewerbliche Kunden.</p>
        <p>PriceVault stellt Software für Preisbeobachtung, Reports, Alerts und Integrationen bereit. Kunden sind für rechtmäßige Nutzung, eigene Zugangsdaten und eingegebene Inhalte verantwortlich.</p>
        <p>Verfuegbarkeit, Support, Zahlungsbedingungen, Laufzeiten und Planlimits ergeben sich aus dem gebuchten Tarif und der Checkout-Bestaetigung.</p>
        <p>Der Anbieter kann Funktionen aus Sicherheits-, Rechts- oder Betriebsgruenden anpassen, sofern der Vertragszweck erhalten bleibt.</p>
        <p>Kontakt für Vertragsfragen: <a className="text-merchant-success" href={`mailto:${legal.email}`}>{legal.email}</a>.</p>
    </LegalPageLayout>
  )
}
