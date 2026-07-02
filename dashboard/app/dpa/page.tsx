import { LegalPageLayout } from '@/components/ui/PublicChrome'
import { legalInfo } from '@/lib/legal'

export default function DpaPage() {
  const legal = legalInfo()
  return (
    <LegalPageLayout eyebrow="DPA / GDPR" title="Auftragsverarbeitung">
        <p>PriceVault stellt für Kunden mit personenbezogenen Daten eine Vereinbarung zur Auftragsverarbeitung bereit.</p>
        <p>Die Vereinbarung beschreibt Gegenstand, Dauer, Art und Zweck der Verarbeitung, Kategorien betroffener Personen, technische und organisatorische Massnahmen sowie Unterauftragsverarbeiter.</p>
        <p>DPA-Anfragen, TOMs und Subprocessor-Fragen gehen an <a className="text-merchant-success" href={`mailto:${legal.dpaEmail}`}>{legal.dpaEmail}</a>.</p>
    </LegalPageLayout>
  )
}
