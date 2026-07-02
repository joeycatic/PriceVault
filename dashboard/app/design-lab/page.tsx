import Link from 'next/link'

const concepts = [
  {
    href: '/design-lab/hygraph',
    number: '01',
    name: 'Structured Studio',
    reference: 'Hygraph-inspiriert',
    description: 'Helle Arbeitsfläche, dreistufige Navigation und ein fokussierter Dateneditor.',
    palette: ['#17131f', '#6d4aff', '#f7f7f8', '#ffffff'],
  },
  {
    href: '/design-lab/vercel',
    number: '02',
    name: 'Monochrome Console',
    reference: 'Vercel-inspiriert',
    description: 'Strenge Typografie, feine Linien und maximale Ruhe für operative Daten.',
    palette: ['#000000', '#ffffff', '#ededed', '#0070f3'],
  },
  {
    href: '/design-lab/control-room',
    number: '03',
    name: 'Control Room',
    reference: 'PriceVault Original',
    description: 'Dichtes Monitoring mit Signalzuständen, großen Kennzahlen und klaren Warnstufen.',
    palette: ['#111410', '#d8ff3e', '#34d3a3', '#ff6b4a'],
  },
  {
    href: '/design-lab/ledger',
    number: '04',
    name: 'Market Ledger',
    reference: 'Editorial Original',
    description: 'Ein analytisches Marktjournal mit tabellarischer Präzision und warmer Papieroptik.',
    palette: ['#f3efe5', '#182b49', '#e14b32', '#f2bf3f'],
  },
]

export default function DesignLabPage() {
  return (
    <main className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8 lg:px-12 lg:py-20">
      <header className="grid gap-8 border-b border-black pb-10 lg:grid-cols-[1fr_24rem] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/45">Vier Richtungen / Ein Produkt</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
            Wie soll sich PriceVault bei der täglichen Arbeit anfühlen?
          </h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-black/60">
          Jede Studie zeigt dieselbe Preisübersicht mit anderer Informationsarchitektur. Öffne die Seiten in separaten Tabs und vergleiche Navigation, Dichte und Lesbarkeit.
        </p>
      </header>

      <section className="grid md:grid-cols-2" aria-label="Designkonzepte">
        {concepts.map((concept, index) => (
          <Link
            key={concept.href}
            href={concept.href}
            className={`group border-b border-black p-6 transition hover:bg-white sm:p-8 ${index % 2 === 0 ? 'md:border-r' : ''}`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="font-mono text-xs text-black/40">{concept.number}</span>
              <span className="text-xl transition group-hover:translate-x-1" aria-hidden="true">↗</span>
            </div>
            <div className="mt-12 flex gap-1" aria-label={`Farbpalette ${concept.name}`}>
              {concept.palette.map((color) => (
                <span key={color} className="h-9 flex-1 border border-black/10" style={{ backgroundColor: color }} />
              ))}
            </div>
            <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.16em] text-black/45">{concept.reference}</p>
            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{concept.name}</h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-black/60">{concept.description}</p>
          </Link>
        ))}
      </section>
    </main>
  )
}
