import { LegalPageLayout } from '@/components/ui/PublicChrome'
import { legalInfo } from '@/lib/legal'

export default function ImpressumPage() {
  const legal = legalInfo()
  return (
    <LegalPageLayout eyebrow="Rechtliches" title="Impressum">
        <p><strong>{legal.company}</strong></p>
        <p>{legal.address}</p>
        {legal.managingDirector && <p>Vertreten durch: {legal.managingDirector}</p>}
        {legal.register && <p>Register: {legal.register}</p>}
        {legal.vatId && <p>USt-ID: {legal.vatId}</p>}
        <p>E-Mail: <a className="text-merchant-success" href={`mailto:${legal.email}`}>{legal.email}</a></p>
        {legal.phone && <p>Telefon: {legal.phone}</p>}
        <p>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: {legal.company}.</p>
    </LegalPageLayout>
  )
}
