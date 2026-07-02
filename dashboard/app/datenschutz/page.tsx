import { legalInfo } from '@/lib/legal'

export default function DatenschutzPage() {
  const legal = legalInfo()
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <p className="eyebrow">DSGVO / Privacy</p>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">Datenschutzerklaerung</h1>
      <section className="panel mt-8 space-y-5 p-6 text-sm leading-7 text-vault-200">
        <p>{legal.company} verarbeitet Kontodaten, Nutzungsdaten, Zahlungsdaten und technische Protokolle zur Bereitstellung von PriceVault.</p>
        <p>Rechtsgrundlagen sind Art. 6 Abs. 1 lit. b DSGVO fuer Vertragserfuellung, lit. c fuer gesetzliche Pflichten und lit. f fuer Sicherheit, Missbrauchsschutz und Produktverbesserung.</p>
        <p>Auftragsverarbeiter koennen Supabase, Vercel, Railway, Browserless, Resend, Sentry und Viva sein. Daten werden nur im erforderlichen Umfang verarbeitet.</p>
        <p>Betroffene koennen Auskunft, Berichtigung, Loeschung, Einschraenkung, Datenuebertragbarkeit und Widerspruch geltend machen.</p>
        <p>Datenschutzkontakt und DPA/GDPR-Anfragen: <a className="text-vault-lime" href={`mailto:${legal.dpaEmail}`}>{legal.dpaEmail}</a>.</p>
      </section>
    </main>
  )
}
