import { LegalPageLayout } from '@/components/ui/PublicChrome'
import { legalInfo } from '@/lib/legal'

export default function DatenschutzPage() {
  const legal = legalInfo()
  return (
    <LegalPageLayout eyebrow="DSGVO / Privacy" title="Datenschutzerklärung">
        <p>{legal.company} verarbeitet Kontodaten, Nutzungsdaten, Zahlungsdaten und technische Protokolle zur Bereitstellung von PriceVault.</p>
        <p>Rechtsgrundlagen sind Art. 6 Abs. 1 lit. b DSGVO für Vertragserfüllung, lit. c für gesetzliche Pflichten und lit. f für Sicherheit, Missbrauchsschutz und Produktverbesserung.</p>
        <p>Auftragsverarbeiter können Supabase, Vercel, Railway, Browserless, Resend, Sentry und Viva sein. Daten werden nur im erforderlichen Umfang verarbeitet.</p>
        <p>Betroffene können Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch geltend machen.</p>
        <p>Datenschutzkontakt und DPA/GDPR-Anfragen: <a className="text-merchant-success" href={`mailto:${legal.dpaEmail}`}>{legal.dpaEmail}</a>.</p>
    </LegalPageLayout>
  )
}
