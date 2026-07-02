import Link from 'next/link'
import type { ReactNode } from 'react'

import { PageHeader } from '@/components/ui/MerchantUI'

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

const chapters = [
  {
    id: 'setup',
    mark: '01',
    title: 'Setup-Reihenfolge',
    summary: 'Mandant, Produktbasis und erste Preisquelle sauber anlegen.',
    links: [
      ['Unternehmen', '/dashboard/company'],
      ['Produkte', '/dashboard/products'],
      ['Mitbewerber', '/dashboard/competitors'],
    ],
    body: [
      'Lege zuerst das eigene Unternehmen mit Shopname und Shop-URL an. Diese Daten sind die Mandantenbasis und erscheinen in Navigation, Reports und Referenzpreisen.',
      'Danach folgen eigene Produkte. Die eigenen Preise sind die Vergleichsbasis für Preisabstände, Alerts und spätere Reports.',
      'Zum Schluss werden Mitbewerber und konkrete Produkt-URLs verbunden. Eine Preisquelle besteht aus eigenem Produkt, Mitbewerber und Produktseite beim Mitbewerber.',
    ],
  },
  {
    id: 'scraping',
    mark: '02',
    title: 'Scraping-Betrieb',
    summary: 'Wie ARQ, Redis, Browserless und Preisquellen zusammenspielen.',
    links: [
      ['Scrape-Jobs', '/dashboard/scrapes'],
      ['Mitbewerber', '/dashboard/competitors'],
    ],
    body: [
      'Der API-Prozess plant Scrapes nur ein. Browserarbeit läuft im ARQ-Worker über Redis, damit Webanfragen kurz bleiben und Browserless CDP sauber genutzt wird.',
      'Globale Abrufe planen alle aktiven Quellen ein. Zeilenaktionen planen nur eine einzelne Preisquelle ein.',
      'Wenn automatische Preisfindung schwankt, hinterlege einen CSS-Selektor direkt an der Preisquelle.',
    ],
  },
  {
    id: 'api',
    mark: '03',
    title: 'Backend-API',
    summary: 'Header, Scrape-Endpunkt und Tenant-Sicherheitsmodell.',
    links: [
      ['API-Keys', '/dashboard/settings/api-keys'],
      ['Einstellungen', '/dashboard/settings/security'],
    ],
    body: [
      'Alle geschützten Backend-Routen erwarten Supabase Bearer Token und X-Tenant-ID. Die Backend-Prüfung muss zur Supabase-Sitzung passen.',
      'Für manuelle Scrapes wird POST /scrape/run genutzt. Ohne competitor_product_ids werden alle aktiven Quellen eingeplant.',
    ],
  },
  {
    id: 'imports',
    mark: '04',
    title: 'Produktimport',
    summary: 'CSV, kopierte Tabellen und deutsches Preisformat.',
    links: [['Produkte', '/dashboard/products']],
    body: [
      'Der Import akzeptiert eingefügten Text oder Dateien. Kopfzeile ist optional. Komma, Semikolon und Tab werden als Trennzeichen erkannt.',
      'Erwartete Spalten sind Name, optional SKU und optional Preis. Preise dürfen deutsch formatiert sein, etwa 199,00.',
    ],
  },
]

const quickLinks = [
  ['Preisübersicht', '/dashboard'],
  ['Produkte', '/dashboard/products'],
  ['Mitbewerber', '/dashboard/competitors'],
  ['Preisalarme', '/dashboard/alerts'],
  ['Einstellungen', '/dashboard/settings'],
]

function FoldableChapter({ chapter, children }: { chapter: (typeof chapters)[number], children?: ReactNode }) {
  return (
    <details id={chapter.id} className="group overflow-hidden rounded-lg border border-vault-700 bg-white open:border-merchant-success/35 open:bg-vault-800" open={chapter.id === 'setup'}>
      <summary className="grid cursor-pointer list-none gap-4 px-4 py-4 transition hover:bg-vault-800/70 sm:grid-cols-[56px_minmax(0,1fr)_24px] sm:px-5">
        <span className="font-mono text-[11px] font-bold text-merchant-success">{chapter.mark}</span>
        <span className="min-w-0">
          <span className="block font-semibold text-vault-100">{chapter.title}</span>
          <span className="mt-1 block text-sm leading-6 text-vault-400">{chapter.summary}</span>
        </span>
        <span className="hidden h-6 w-6 place-items-center border border-vault-700 font-mono text-xs text-vault-300 transition group-open:rotate-45 group-open:border-merchant-success group-open:text-merchant-success sm:grid">
          +
        </span>
      </summary>
      <div className="border-t border-vault-700 px-4 py-5 sm:px-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-3 text-sm leading-6 text-vault-300">
            {chapter.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {children}
          </div>
          <div className="grid content-start gap-2">
            {chapter.links.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-lg border border-vault-700 bg-vault-950/80 px-3 py-2 text-xs font-semibold text-vault-300 transition hover:border-merchant-success/40 hover:text-merchant-success">
                {label} →
              </Link>
            ))}
          </div>
        </div>
      </div>
    </details>
  )
}

export default function WikiPage() {
  const backendUrl = process.env.BACKEND_URL ?? 'Nicht konfiguriert'

  return (
    <>
      <PageHeader
        eyebrow="Referenz"
        title="PriceVault Referenz"
        description="Betriebswissen für Einrichtung, Preisquellen, Scraping, API und Fehlerbehebung. Kompakt für den Alltag und vollständig für Supportfälle."
        actions={<div className="max-w-xs rounded-lg border border-vault-700 bg-white px-4 py-3"><p className="text-xs text-vault-500">Backend</p><p className="mt-1 break-all font-mono text-xs text-vault-100">{backendUrl}</p></div>}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <aside className="sticky top-24 hidden xl:block">
          <nav className="grid gap-1 border border-vault-700 bg-vault-900/80 p-2" aria-label="Referenzindex">
            {chapters.map((chapter) => (
              <a key={chapter.id} href={`#${chapter.id}`} className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-2 px-3 py-2 text-xs text-vault-300 transition hover:bg-vault-800 hover:text-merchant-success">
                <span className="font-mono text-vault-500">{chapter.mark}</span>
                <span>{chapter.title}</span>
              </a>
            ))}
          </nav>
        </aside>

        <section className="space-y-3" aria-label="Referenzkapitel">
          <FoldableChapter chapter={chapters[0]} />
          <FoldableChapter chapter={chapters[1]} />
          <FoldableChapter chapter={chapters[2]}>
            <div className="mt-4 overflow-hidden border border-vault-700">
              <div className="border-b border-vault-700 bg-vault-800/70 px-4 py-3">
                <p className="font-mono text-xs text-vault-100">POST /scrape/run</p>
              </div>
              <div className="grid gap-px bg-vault-700 md:grid-cols-2">
                <div className="bg-vault-950 p-4">
                  <p className="text-xs font-bold uppercase text-vault-500">Alle aktiven Quellen</p>
                  <pre className="mt-3 overflow-x-auto text-xs text-vault-200"><code>{scrapeRunBody}</code></pre>
                </div>
                <div className="bg-vault-950 p-4">
                  <p className="text-xs font-bold uppercase text-vault-500">Einzelne Quelle</p>
                  <pre className="mt-3 overflow-x-auto text-xs text-vault-200"><code>{singleScrapeBody}</code></pre>
                </div>
              </div>
            </div>
            <p>
              Erforderliche Header: <span className="font-mono text-vault-100">Content-Type: application/json</span>,{' '}
              <span className="font-mono text-vault-100">Authorization: Bearer &lt;supabase-access-token&gt;</span> und{' '}
              <span className="font-mono text-vault-100">X-Tenant-ID: &lt;tenant-id&gt;</span>.
            </p>
          </FoldableChapter>
          <FoldableChapter chapter={chapters[3]}>
            <pre className="mt-4 overflow-x-auto border border-vault-700 bg-vault-950 p-4 text-xs text-vault-200"><code>{importExample}</code></pre>
          </FoldableChapter>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-vault-700 bg-vault-900/80 p-5" aria-labelledby="reference-quicklinks">
            <p className="eyebrow">Direktzugriff</p>
            <h2 id="reference-quicklinks" className="mt-2 font-semibold">Arbeitsbereiche</h2>
            <div className="mt-4 grid gap-2">
              {quickLinks.map(([label, href]) => (
                <Link key={href} href={href} className="rounded-lg border border-vault-700 bg-vault-950/70 px-3 py-2 text-sm text-vault-300 transition hover:border-merchant-success/40 hover:text-merchant-success">
                  {label} →
                </Link>
              ))}
            </div>
          </section>

          <section className="border border-merchant-success/30 bg-emerald-100 p-5" aria-labelledby="reference-troubleshooting">
            <p className="eyebrow">Fehlerbehebung</p>
            <h2 id="reference-troubleshooting" className="mt-2 font-semibold">Scraping läuft nicht</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-vault-300">
              <li><span className="font-mono text-vault-100">BACKEND_URL</span> prüfen.</li>
              <li>Produkt-URL beim Mitbewerber im Browser öffnen.</li>
              <li>Bei dynamischen Shops Preis-Selektor setzen.</li>
              <li>Einzelabruf starten und Job-Verlauf prüfen.</li>
              <li>Backend-Logs nach Timeout oder Browserless-Fehlern prüfen.</li>
            </ol>
          </section>

          <section className="rounded-lg border border-vault-700 bg-vault-900/80 p-5" aria-labelledby="reference-env">
            <p className="eyebrow">Betrieb</p>
            <h2 id="reference-env" className="mt-2 font-semibold">Variablen</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-mono text-vault-100">BACKEND_URL</dt>
                <dd className="mt-1 text-vault-500">FastAPI-Basis-URL für Dashboard-Aufrufe.</dd>
              </div>
              <div>
                <dt className="font-mono text-vault-100">REDIS_URL</dt>
                <dd className="mt-1 text-vault-500">ARQ-Queue für Scrapes, Alerts und Mails.</dd>
              </div>
              <div>
                <dt className="font-mono text-vault-100">BROWSERLESS_TOKEN</dt>
                <dd className="mt-1 text-vault-500">Remote-Browser-Zugriff für CDP-Scraping.</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  )
}
