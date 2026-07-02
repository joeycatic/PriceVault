import { LegalPageLayout } from '@/components/ui/PublicChrome'
import { legalInfo } from '@/lib/legal'

export default function CancellationPage() {
  const legal = legalInfo()
  return (
    <LegalPageLayout eyebrow="Abonnement" title="Kündigung und Rückerstattung">
        <p>Kunden können kostenpflichtige Pläne zum Ende des laufenden Abrechnungszeitraums kündigen.</p>
        <p>Bereits gestartete Abrechnungszeitraeume werden grundsaetzlich nicht anteilig erstattet, ausser gesetzliche Rechte oder eine schriftliche Kulanzzusage greifen.</p>
        <p>Bei Fehlbuchungen, doppelten Zahlungen oder nicht bereitgestelltem Service prüft PriceVault Rückerstattungen zeitnah.</p>
        <p>Anfragen: <a className="text-merchant-success" href={`mailto:${legal.email}`}>{legal.email}</a>.</p>
    </LegalPageLayout>
  )
}
