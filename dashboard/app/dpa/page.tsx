import { legalInfo } from '@/lib/legal'

export default function DpaPage() {
  const legal = legalInfo()
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <p className="eyebrow">DPA / GDPR</p>
      <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">Auftragsverarbeitung</h1>
      <section className="panel mt-8 space-y-5 p-6 text-sm leading-7 text-vault-200">
        <p>PriceVault stellt fuer Kunden mit personenbezogenen Daten eine Vereinbarung zur Auftragsverarbeitung bereit.</p>
        <p>Die Vereinbarung beschreibt Gegenstand, Dauer, Art und Zweck der Verarbeitung, Kategorien betroffener Personen, technische und organisatorische Massnahmen sowie Unterauftragsverarbeiter.</p>
        <p>DPA-Anfragen, TOMs und Subprocessor-Fragen gehen an <a className="text-vault-lime" href={`mailto:${legal.dpaEmail}`}>{legal.dpaEmail}</a>.</p>
      </section>
    </main>
  )
}
