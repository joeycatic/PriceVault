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
  {
    href: '/design-lab/swiss-grid',
    number: '05',
    name: 'Swiss Grid',
    reference: 'International Style',
    description: 'Radikale Typografie, Primärfarben und ein streng gerastertes Informationssystem.',
    palette: ['#f5f4ef', '#111111', '#e5362f', '#1268d8'],
  },
  {
    href: '/design-lab/focus-console',
    number: '06',
    name: 'Focus Console',
    reference: 'Calm Productivity',
    description: 'Eine ruhige dunkle Arbeitsfläche mit kompakter Navigation und klaren Aktionssignalen.',
    palette: ['#0f1014', '#292633', '#8b6cff', '#61d6a0'],
  },
  {
    href: '/design-lab/blueprint',
    number: '07',
    name: 'Market Blueprint',
    reference: 'Technical Schematic',
    description: 'Preisbeziehungen als technischer Bauplan mit Koordinaten, Knoten und Prüfzuständen.',
    palette: ['#0c4fa3', '#f1f7ff', '#ffcf42', '#79f0c0'],
  },
  {
    href: '/design-lab/commerce-desk',
    number: '08',
    name: 'Commerce Desk',
    reference: 'Retail Operations',
    description: 'Eine pragmatische Arbeitswarteschlange für tägliche Entscheidungen im E-Commerce.',
    palette: ['#f4f6f1', '#123d32', '#f3c64d', '#d85a3c'],
  },
  {
    href: '/design-lab/soft-console',
    number: '09',
    name: 'Soft Console',
    reference: 'Approachable SaaS',
    description: 'Freundliche Statusflächen, sanfte Kontraste und verständliche Sprache für kleinere Teams.',
    palette: ['#f7f3f4', '#29252b', '#ef6f61', '#e5f3ec'],
  },
  {
    href: '/design-lab/brutalist-ops',
    number: '10',
    name: 'Brutalist Ops',
    reference: 'Raw Utility',
    description: 'Kompromisslose Kontraste, harte Raster und maximale Sichtbarkeit kritischer Daten.',
    palette: ['#f0f0e8', '#000000', '#f2ff48', '#ff5c39'],
  },
  {
    href: '/design-lab/radar',
    number: '11',
    name: 'Radar Surveillance',
    reference: 'Control Room Extension',
    description: 'Kreisförmiger Radar-Sweep, Signalqualität und Ping-Alarme für neue Abweichungen.',
    palette: ['#07100d', '#55efaa', '#29483c', '#ff6c4c'],
  },
  {
    href: '/design-lab/terminal',
    number: '12',
    name: 'Terminal Native',
    reference: 'CLI Workspace',
    description: 'Prompt-gesteuerte Aktionen, ASCII-Tabellen und eine kompromisslose Terminal-Sprache.',
    palette: ['#050706', '#9bf6b4', '#275d37', '#ff776d'],
  },
  {
    href: '/design-lab/diff-view',
    number: '13',
    name: 'Price Diff',
    reference: 'Code Review Metaphor',
    description: 'Preisänderungen als Git-Diff mit Zeilengutter, alten Werten und hervorgehobenen Updates.',
    palette: ['#0d1117', '#161b22', '#2ea043', '#f85149'],
  },
  {
    href: '/design-lab/trading-desk',
    number: '14',
    name: 'Trading Desk',
    reference: 'Dense Market Terminal',
    description: 'Laufender Preisticker, Live Book und maximale Informationsdichte für Power User.',
    palette: ['#101317', '#ffb020', '#52d49a', '#ff7b72'],
  },
  {
    href: '/design-lab/field-notebook',
    number: '15',
    name: 'Field Notebook',
    reference: 'Analyst Notes',
    description: 'Dot-Grid-Papier, handschriftliche Randnotizen und schnelle strukturierte Beobachtungen.',
    palette: ['#f8f5e9', '#24342e', '#d45b3e', '#fff3a8'],
  },
  {
    href: '/design-lab/clean-workspace',
    number: '16',
    name: 'Clean Workspace',
    reference: 'Restrained SaaS',
    description: 'Leise Typografie, viel Weißraum und nur die nötigsten Statusfarben und Aktionen.',
    palette: ['#ffffff', '#17211d', '#edf2ef', '#176b4d'],
  },
]

export default function DesignLabPage() {
  return (
    <main className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8 lg:px-12 lg:py-20">
      <header className="grid gap-8 border-b border-black pb-10 lg:grid-cols-[1fr_24rem] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/45">Sechzehn Richtungen / Ein Produkt</p>
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
