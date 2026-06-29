import Link from 'next/link'

const scrapeRunBody = `{
  "tenant_id": "<tenant-id>",
  "competitor_product_ids": null
}`

const singleScrapeBody = `{
  "tenant_id": "<tenant-id>",
  "competitor_product_ids": ["<competitor-product-id>"]
}`

const importExample = `name;sku;price
Mars Hydro SP3000;MH-SP3000;199,00
Lumatek ATS 300W;LUM-300;279,90`

const sections = [
  {
    title: '1. Unternehmensprofil',
    body: 'Lege zuerst dein eigenes Unternehmen mit Shopname und Shop-URL an. Diese Daten sind die Mandantenbasis und werden für Navigation, Referenzpreise und Reports genutzt.',
    href: '/dashboard/company',
    cta: 'Unternehmen öffnen',
  },
  {
    title: '2. Eigene Produkte',
    body: 'Produkte können einzeln, per kopierter CSV-Tabelle oder per CSV-Datei importiert werden. Unterstützt werden Komma, Semikolon und Tab als Trennzeichen.',
    href: '/dashboard/products',
    cta: 'Produkte pflegen',
  },
  {
    title: '3. Mitbewerber',
    body: 'Mitbewerber enthalten Basis-URL, optionale Standard-Selektoren und Abrufintervall. Produktgenaue URLs werden danach als Preisquellen hinterlegt.',
    href: '/dashboard/competitors',
    cta: 'Mitbewerber pflegen',
  },
]

export default function WikiPage() {
  const backendUrl = process.env.BACKEND_URL ?? 'Nicht konfiguriert'

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Langfristige Referenz</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">PriceVault Wiki</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-vault-300">
          Betriebswissen für Onboarding, Produktimport, Scraping, Backend-API und Fehlerbehebung. Diese Seite ist als dauerhafte interne Referenz gedacht.
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="panel p-5 sm:p-6" aria-labelledby="wiki-setup">
            <p className="eyebrow">Setup-Reihenfolge</p>
            <h2 id="wiki-setup" className="mt-2 text-xl font-semibold">Empfohlener Ablauf</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {sections.map((section) => (
                <article key={section.title} className="flex min-h-56 flex-col border border-vault-700 bg-vault-950/70 p-4">
                  <h3 className="font-semibold">{section.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-vault-300">{section.body}</p>
                  <Link className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-vault-lime" href={section.href}>
                    {section.cta} →
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="wiki-scraping">
            <p className="eyebrow">Scraping</p>
            <h2 id="wiki-scraping" className="mt-2 text-xl font-semibold">Wie Preisabrufe funktionieren</h2>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="border border-vault-700 bg-vault-950/70 p-4">
                <h3 className="font-semibold">Automatisch</h3>
                <p className="mt-2 text-sm leading-6 text-vault-300">
                  Der FastAPI-Scheduler startet beim Backend-Start und ruft alle aktiven Preisquellen alle 12 Stunden ab. Zusätzlich läuft beim Start ein initialer Abruf.
                </p>
              </div>
              <div className="border border-vault-700 bg-vault-950/70 p-4">
                <h3 className="font-semibold">Manuell</h3>
                <p className="mt-2 text-sm leading-6 text-vault-300">
                  Über die Buttons „Jetzt abrufen“ wird der Backend-Endpunkt direkt ausgelöst. Global bedeutet alle aktiven Quellen; pro Tabellenzeile bedeutet nur diese eine Quelle.
                </p>
              </div>
              <div className="border border-vault-700 bg-vault-950/70 p-4">
                <h3 className="font-semibold">Preisquellen</h3>
                <p className="mt-2 text-sm leading-6 text-vault-300">
                  Eine Preisquelle verbindet dein Produkt, einen Mitbewerber und die konkrete Produkt-URL beim Mitbewerber. Optionale CSS-Selektoren helfen, wenn die automatische Erkennung nicht zuverlässig ist.
                </p>
              </div>
              <div className="border border-vault-700 bg-vault-950/70 p-4">
                <h3 className="font-semibold">Ergebnisanzeige</h3>
                <p className="mt-2 text-sm leading-6 text-vault-300">
                  Der Produktbereich zeigt den letzten Abruf, gefundene Preise und fehlgeschlagene Scrapes. Die Preisübersicht nutzt die jeweils neuesten gespeicherten Snapshots.
                </p>
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="wiki-api">
            <p className="eyebrow">Backend API</p>
            <h2 id="wiki-api" className="mt-2 text-xl font-semibold">Scraping-Endpunkte</h2>
            <div className="mt-5 space-y-4 text-sm leading-6 text-vault-300">
              <p>
                Das Dashboard liest die Backend-Basis-URL aus <span className="font-mono text-vault-100">BACKEND_URL</span>.
                Aktuell konfiguriert: <span className="font-mono text-vault-lime">{backendUrl}</span>
              </p>
              <div className="overflow-hidden border border-vault-700">
                <div className="border-b border-vault-700 bg-vault-800/70 px-4 py-3">
                  <p className="font-mono text-xs text-vault-100">POST /scrape/run</p>
                </div>
                <div className="grid gap-px bg-vault-700 md:grid-cols-2">
                  <div className="bg-vault-950 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-vault-500">Alle aktiven Quellen</p>
                    <pre className="mt-3 overflow-x-auto text-xs text-vault-200"><code>{scrapeRunBody}</code></pre>
                  </div>
                  <div className="bg-vault-950 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-vault-500">Einzelne Quelle</p>
                    <pre className="mt-3 overflow-x-auto text-xs text-vault-200"><code>{singleScrapeBody}</code></pre>
                  </div>
                </div>
              </div>
              <p>
                Erforderliche Header: <span className="font-mono text-vault-100">Content-Type: application/json</span> und{' '}
                <span className="font-mono text-vault-100">X-Tenant-ID: &lt;tenant-id&gt;</span>. Backend und Body müssen denselben Mandanten verwenden.
              </p>
            </div>
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="wiki-imports">
            <p className="eyebrow">Produktimport</p>
            <h2 id="wiki-imports" className="mt-2 text-xl font-semibold">CSV-Format</h2>
            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="text-sm leading-6 text-vault-300">
                <p>
                  Der Import akzeptiert eingefügten Text oder eine Datei. Kopfzeile ist optional. Pro Import werden maximal 250 Produkte verarbeitet.
                </p>
                <p className="mt-3">
                  Erwartete Spalten: <span className="font-mono text-vault-100">Name</span>, optional{' '}
                  <span className="font-mono text-vault-100">SKU</span>, optional <span className="font-mono text-vault-100">Preis</span>.
                  Preise dürfen deutsch formatiert sein, zum Beispiel <span className="font-mono text-vault-100">199,00</span>.
                </p>
              </div>
              <pre className="overflow-x-auto border border-vault-700 bg-vault-950 p-4 text-xs text-vault-200"><code>{importExample}</code></pre>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5" aria-labelledby="wiki-quicklinks">
            <p className="eyebrow">Quicklinks</p>
            <h2 id="wiki-quicklinks" className="mt-2 font-semibold">Wichtige Bereiche</h2>
            <div className="mt-4 grid gap-2">
              {[
                ['Unternehmen', '/dashboard/company'],
                ['Produkte', '/dashboard/products'],
                ['Mitbewerber', '/dashboard/competitors'],
                ['Preisalarme', '/dashboard/alerts'],
                ['Preisübersicht', '/dashboard'],
              ].map(([label, href]) => (
                <Link key={href} href={href} className="border border-vault-700 px-3 py-2 text-sm text-vault-300 transition hover:border-vault-lime/40 hover:text-vault-lime">
                  {label} →
                </Link>
              ))}
            </div>
          </section>

          <section className="border border-vault-lime/30 bg-vault-lime/10 p-5" aria-labelledby="wiki-troubleshooting">
            <p className="eyebrow text-vault-lime">Fehlerbehebung</p>
            <h2 id="wiki-troubleshooting" className="mt-2 font-semibold">Wenn Scraping nicht läuft</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-vault-300">
              <li>Prüfen, ob <span className="font-mono text-vault-100">BACKEND_URL</span> gesetzt und erreichbar ist.</li>
              <li>Mitbewerber-URL und Produkt-URL im Browser öffnen.</li>
              <li>Bei dynamischen Shops einen Preis-Selektor hinterlegen.</li>
              <li>Manuellen Abruf für eine einzelne Quelle starten und Ergebnis abwarten.</li>
              <li>Backend-Logs nach Scraper- oder Timeout-Fehlern prüfen.</li>
            </ol>
          </section>

          <section className="panel p-5" aria-labelledby="wiki-env">
            <p className="eyebrow">Betrieb</p>
            <h2 id="wiki-env" className="mt-2 font-semibold">Relevante Variablen</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-mono text-vault-100">BACKEND_URL</dt>
                <dd className="mt-1 text-vault-500">Basis-URL der FastAPI, lokal meist http://localhost:8000.</dd>
              </div>
              <div>
                <dt className="font-mono text-vault-100">SCRAPE_CONCURRENCY</dt>
                <dd className="mt-1 text-vault-500">Parallele Scrapes im Backend. Standard ist 3.</dd>
              </div>
              <div>
                <dt className="font-mono text-vault-100">NEXT_PUBLIC_SUPABASE_URL</dt>
                <dd className="mt-1 text-vault-500">Supabase-Projekt für Dashboard-Auth und Daten.</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  )
}
