import Link from 'next/link'

import { AdditionalConceptPreview, type AdditionalConceptName } from '@/components/design-lab/AdditionalConceptPreviews'
import { SpecializedConceptPreview, type SpecializedConceptName } from '@/components/design-lab/SpecializedConceptPreviews'

const products = [
  { name: 'Nike Air Max 90', sku: 'NK-AM90-001', own: '149,90 €', market: '132,00 €', delta: '-11,9 %', source: 'SneakerWorld', state: 'Kritisch' },
  { name: 'Adidas Samba OG', sku: 'AD-SAM-042', own: '119,00 €', market: '115,50 €', delta: '-2,9 %', source: 'Urban Kicks', state: 'Beobachten' },
  { name: 'New Balance 550', sku: 'NB-550-107', own: '139,95 €', market: '144,00 €', delta: '+2,9 %', source: 'Solebox', state: 'Stabil' },
  { name: 'Asics Gel-Kayano 14', sku: 'AS-GK14-214', own: '169,90 €', market: '159,99 €', delta: '-5,8 %', source: 'Run Supply', state: 'Kritisch' },
  { name: 'Salomon XT-6', sku: 'SA-XT6-901', own: '180,00 €', market: '184,95 €', delta: '+2,8 %', source: 'Trail Dept.', state: 'Stabil' },
]

const nav = ['Übersicht', 'Produkte', 'Mitbewerber', 'Preisalarme', 'Reports']

function Trend({ positive = false, dark = false }: { positive?: boolean; dark?: boolean }) {
  const bars = positive ? [28, 38, 35, 48, 54, 66, 72] : [68, 59, 62, 45, 49, 33, 25]
  return (
    <span className="flex h-7 items-end gap-[3px]" aria-label={positive ? 'Positiver Trend' : 'Negativer Trend'}>
      {bars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={`w-[3px] ${positive ? 'bg-[#1f9d69]' : dark ? 'bg-[#ff6b4a]' : 'bg-[#d63e32]'}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </span>
  )
}

function MiniBars({ color = '#7048e8' }: { color?: string }) {
  return (
    <div className="flex h-14 items-end gap-1" aria-hidden="true">
      {[42, 64, 48, 76, 58, 87, 71, 92, 66, 80, 95, 84].map((height, index) => (
        <span key={`${height}-${index}`} className="min-w-1 flex-1" style={{ height: `${height}%`, backgroundColor: color, opacity: 0.35 + index * 0.045 }} />
      ))}
    </div>
  )
}

function HygraphConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#f7f7f8] text-[#211b2a]">
      <div className="grid min-h-[calc(100vh-3rem)] lg:grid-cols-[4.5rem_15rem_1fr]">
        <aside className="flex items-center justify-between bg-[#17131f] px-4 py-3 text-white lg:flex-col lg:py-5">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-[#7257ff] text-xs font-black">PV</div>
          <nav className="flex gap-2 lg:flex-col" aria-label="Bereiche">
            {['⌂', '◇', '≡', '◎', '↗'].map((icon, index) => (
              <button key={`${icon}-${index}`} type="button" aria-label={nav[index] ?? 'Öffnen'} className={`grid h-10 w-10 place-items-center rounded-md text-lg transition ${index === 0 ? 'bg-white/15 text-white' : 'text-white/45 hover:bg-white/10 hover:text-white'}`}>
                {icon}
              </button>
            ))}
          </nav>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f3d17c] text-xs font-bold text-[#302300]">JS</span>
        </aside>

        <aside className="hidden border-r border-[#dedce2] bg-white px-4 py-5 lg:block">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Smokeify Store</p>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-md border border-[#dedce2] text-lg" aria-label="Projekt wechseln">⌄</button>
          </div>
          <div className="mt-7">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a8490]">Arbeitsbereich</p>
            <nav className="mt-2 space-y-1" aria-label="Hauptnavigation">
              {nav.map((item, index) => (
                <a key={item} href={`#${item.toLowerCase()}`} className={`flex min-h-10 items-center justify-between rounded-md px-3 text-sm ${index === 0 ? 'bg-[#eeeaff] font-semibold text-[#5533d7]' : 'text-[#5f5866] hover:bg-[#f5f4f6]'}`}>
                  <span>{item}</span><span className="text-xs text-[#aaa4af]">{index === 0 ? '24' : ''}</span>
                </a>
              ))}
            </nav>
          </div>
          <div className="mt-8 border-t border-[#ebe9ed] pt-5">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a8490]">Gespeicherte Ansichten</p>
            <div className="mt-3 space-y-3 px-2 text-sm text-[#6d6674]">
              <p><span className="mr-2 text-red-500">●</span>Handlungsbedarf</p>
              <p><span className="mr-2 text-amber-500">●</span>Unter 5 % Marge</p>
              <p><span className="mr-2 text-emerald-500">●</span>Preisführer</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-16 items-center justify-between border-b border-[#dedce2] bg-white px-5 lg:px-8">
            <div className="flex items-center gap-2 text-sm text-[#7d7683]"><span>Marktmonitor</span><span>/</span><strong className="text-[#211b2a]">Übersicht</strong></div>
            <div className="flex items-center gap-2">
              <button type="button" className="hidden min-h-9 rounded-md border border-[#dedce2] px-3 text-xs font-semibold text-[#5f5866] sm:block">⌘ K &nbsp; Suchen</button>
              <Link href="/dashboard/settings" className="grid h-9 w-9 place-items-center rounded-md border border-[#dedce2]" aria-label="Einstellungen">⚙</Link>
            </div>
          </header>

          <div className="px-5 py-7 lg:px-8 lg:py-9">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div><p className="text-xs font-semibold text-[#7257ff]">PREISÜBERSICHT</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Guten Morgen, Joey.</h1><p className="mt-2 text-sm text-[#746d7a]">Zwei Produkte benötigen heute deine Aufmerksamkeit.</p></div>
              <button type="button" className="min-h-10 rounded-md bg-[#7257ff] px-4 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(114,87,255,.2)]">+ Preisquelle</button>
            </div>

            <section className="mt-8 grid gap-px overflow-hidden rounded-md border border-[#dedce2] bg-[#dedce2] sm:grid-cols-2 xl:grid-cols-4" aria-label="Kennzahlen">
              {[['Überwachte Preise', '24', '+3 diese Woche'], ['Handlungsbedarf', '2', '8,3 % der Produkte'], ['Preisführer', '9', '37,5 % des Sortiments'], ['Erfolgsquote', '98,6 %', 'Letzte 30 Tage']].map(([label, value, detail], index) => (
                <article key={label} className="bg-white p-5"><div className="flex items-start justify-between"><p className="text-xs font-medium text-[#77717d]">{label}</p><span className={`h-2 w-2 rounded-full ${index === 1 ? 'bg-red-500' : 'bg-[#7257ff]'}`} /></div><p className="mt-5 text-3xl font-semibold tracking-[-0.04em]">{value}</p><p className="mt-1 text-xs text-[#99939e]">{detail}</p></article>
              ))}
            </section>

            <section className="mt-6 overflow-hidden rounded-md border border-[#dedce2] bg-white">
              <div className="flex flex-col justify-between gap-4 border-b border-[#ebe9ed] p-5 sm:flex-row sm:items-center"><div><h2 className="font-semibold">Preispositionen</h2><p className="mt-1 text-xs text-[#827b88]">Nach größter negativer Abweichung sortiert</p></div><div className="flex gap-2"><button type="button" className="min-h-9 rounded-md border border-[#dedce2] px-3 text-xs font-semibold">Filter</button><button type="button" className="min-h-9 rounded-md border border-[#dedce2] px-3 text-xs font-semibold">Exportieren</button></div></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#faf9fb] text-[10px] uppercase tracking-[0.1em] text-[#8f8994]"><tr>{['Produkt', 'Eigener Preis', 'Marktpreis', 'Abweichung', 'Mitbewerber', 'Trend'].map((head) => <th key={head} className="px-5 py-3 font-semibold">{head}</th>)}</tr></thead><tbody>{products.slice(0, 4).map((product) => <tr key={product.sku} className="border-t border-[#ebe9ed] hover:bg-[#faf9ff]"><td className="px-5 py-4"><p className="font-semibold">{product.name}</p><p className="mt-1 font-mono text-[10px] text-[#99939e]">{product.sku}</p></td><td className="px-5 py-4">{product.own}</td><td className="px-5 py-4">{product.market}</td><td className={`px-5 py-4 font-semibold ${product.delta.startsWith('-') ? 'text-red-600' : 'text-emerald-600'}`}>{product.delta}</td><td className="px-5 py-4 text-[#6d6674]">{product.source}</td><td className="px-5 py-4"><Trend positive={!product.delta.startsWith('-')} /></td></tr>)}</tbody></table>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function VercelConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-white text-black">
      <header className="border-b border-[#eaeaea]">
        <div className="mx-auto flex min-h-16 max-w-[1400px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3"><span className="text-xl">▲</span><span className="text-sm font-semibold">PriceVault</span><span className="text-[#999]">/</span><button type="button" className="text-sm font-medium">Smokeify Store⌄</button></div>
          <nav className="hidden items-center gap-6 text-sm text-[#666] md:flex" aria-label="Kontonavigation"><a href="#feedback">Feedback</a><a href="#hilfe">Hilfe</a><Link href="/dashboard/settings">Einstellungen</Link><span className="grid h-8 w-8 place-items-center rounded-full bg-black text-xs font-semibold text-white">JS</span></nav>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-black text-xs font-semibold text-white md:hidden">JS</span>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-[1400px] gap-6 overflow-x-auto px-5 text-sm text-[#666] lg:px-8" aria-label="Hauptnavigation">
          {nav.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`shrink-0 border-b-2 py-4 ${index === 0 ? 'border-black font-medium text-black' : 'border-transparent hover:text-black'}`}>{item}</a>)}
        </nav>
      </header>

      <div className="mx-auto max-w-[1200px] px-5 py-10 lg:px-8 lg:py-14">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div><p className="text-sm text-[#666]">Smokeify Store</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Preisübersicht</h1></div>
          <div className="flex gap-2"><button type="button" className="min-h-10 rounded-md border border-[#e1e1e1] px-4 text-sm font-medium shadow-sm">CSV exportieren</button><button type="button" className="min-h-10 rounded-md bg-black px-4 text-sm font-medium text-white">Jetzt prüfen</button></div>
        </div>

        <section className="mt-9 grid overflow-hidden rounded-md border border-[#eaeaea] md:grid-cols-2 xl:grid-cols-4" aria-label="Kennzahlen">
          {[['Produkte', '24', '5 Mitbewerber'], ['Unterboten', '2', '−1 seit gestern'], ['Ø Preisvorteil', '+3,8 %', 'Letzte 30 Tage'], ['Scrape-Status', '98,6 %', 'Alle Systeme aktiv']].map(([label, value, detail], index) => (
            <article key={label} className="border-b border-[#eaeaea] p-5 last:border-b-0 md:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0"><div className="flex items-center justify-between"><p className="text-sm text-[#666]">{label}</p><span className={`h-2 w-2 rounded-full ${index === 1 ? 'bg-[#f5a623]' : 'bg-[#1aab40]'}`} /></div><p className="mt-7 text-3xl font-semibold tracking-[-0.04em]">{value}</p><p className="mt-2 text-xs text-[#888]">{detail}</p></article>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
          <div className="rounded-md border border-[#eaeaea]">
            <div className="flex items-center justify-between border-b border-[#eaeaea] px-5 py-4"><div><h2 className="text-sm font-semibold">Marktposition</h2><p className="mt-1 text-xs text-[#888]">Preisabstand der letzten 14 Tage</p></div><button type="button" className="text-sm text-[#666]">14 Tage⌄</button></div>
            <div className="p-6"><div className="flex h-48 items-end gap-2 border-b border-l border-[#eaeaea] pl-4">{[48, 56, 52, 64, 61, 70, 67, 78, 72, 84, 79, 88, 82, 91].map((height, index) => <span key={`${height}-${index}`} className="flex-1 bg-black transition hover:bg-[#0070f3]" style={{ height: `${height}%` }} />)}</div><div className="mt-3 flex justify-between text-[10px] text-[#999]"><span>18. JUN</span><span>25. JUN</span><span>02. JUL</span></div></div>
          </div>
          <aside className="rounded-md border border-[#eaeaea]">
            <div className="border-b border-[#eaeaea] px-5 py-4"><h2 className="text-sm font-semibold">Aktivität</h2><p className="mt-1 text-xs text-[#888]">Letzte Aktualisierungen</p></div>
            <div className="divide-y divide-[#eaeaea]">{[['Preislauf abgeschlossen', 'vor 12 Min.'], ['2 neue Abweichungen', 'vor 1 Std.'], ['Report versendet', 'gestern'], ['Quelle wieder aktiv', 'gestern']].map(([label, time], index) => <div key={label} className="flex gap-3 p-4"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${index === 1 ? 'bg-[#f5a623]' : 'bg-[#1aab40]'}`} /><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs text-[#888]">{time}</p></div></div>)}</div>
          </aside>
        </section>

        <section className="mt-8 overflow-hidden rounded-md border border-[#eaeaea]">
          <div className="flex flex-col justify-between gap-4 border-b border-[#eaeaea] px-5 py-4 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold">Produkte</h2><p className="mt-1 text-xs text-[#888]">Live-Daten aus 12 Preisquellen</p></div><input className="min-h-9 rounded-md border border-[#ddd] bg-white px-3 text-sm text-black outline-none placeholder:text-[#999] focus:border-black" placeholder="Produkte suchen …" aria-label="Produkte suchen" /></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs text-[#777]"><tr>{['Produkt', 'Eigener Preis', 'Bester Marktpreis', 'Differenz', 'Status'].map((head) => <th key={head} className="border-b border-[#eaeaea] px-5 py-3 font-medium">{head}</th>)}</tr></thead><tbody>{products.map((product) => <tr key={product.sku} className="border-b border-[#eaeaea] last:border-b-0 hover:bg-[#fafafa]"><td className="px-5 py-4"><p className="font-medium">{product.name}</p><p className="mt-1 font-mono text-[10px] text-[#999]">{product.sku}</p></td><td className="px-5 py-4">{product.own}</td><td className="px-5 py-4">{product.market}</td><td className={product.delta.startsWith('-') ? 'px-5 py-4 text-[#d32f2f]' : 'px-5 py-4 text-[#16833e]'}>{product.delta}</td><td className="px-5 py-4"><span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${product.state === 'Stabil' ? 'bg-[#1aab40]' : product.state === 'Kritisch' ? 'bg-[#e5484d]' : 'bg-[#f5a623]'}`} />{product.state}</span></td></tr>)}</tbody></table></div>
        </section>
      </div>
    </main>
  )
}

function ControlRoomConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#10130f] text-[#eef2e8] [background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.018)_0,rgba(255,255,255,.018)_1px,transparent_1px,transparent_9px)]">
      <div className="border-b border-[#3a4234] bg-[#151914]">
        <header className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between px-4 lg:px-7"><div className="flex items-center gap-4"><span className="grid h-9 w-9 place-items-center bg-[#d8ff3e] text-xs font-black text-[#10130f]">PV</span><div><p className="text-sm font-bold uppercase">PriceVault</p><p className="font-mono text-[9px] uppercase text-[#7f8b77]">Market operations system</p></div></div><div className="flex items-center gap-3"><span className="hidden items-center gap-2 border border-[#3a4234] px-3 py-2 font-mono text-[10px] text-[#aab4a3] sm:flex"><span className="h-2 w-2 bg-[#34d3a3] shadow-[0_0_10px_#34d3a3]" />SYSTEME NORMAL</span><Link href="/dashboard/settings" className="grid h-9 w-9 place-items-center border border-[#3a4234] text-[#aab4a3]" aria-label="Einstellungen">⚙</Link></div></header>
        <nav className="no-scrollbar mx-auto flex max-w-[1600px] overflow-x-auto border-t border-[#272d24] px-4 lg:px-7" aria-label="Hauptnavigation">{nav.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`shrink-0 border-x border-[#272d24] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] ${index === 0 ? 'bg-[#d8ff3e] font-bold text-[#10130f]' : 'text-[#899382] hover:bg-[#1e241c] hover:text-white'}`}>{String(index + 1).padStart(2, '0')} / {item}</a>)}</nav>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-7 lg:px-7 lg:py-10">
        <header className="grid gap-6 border-b border-[#3a4234] pb-7 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#d8ff3e]">Live market telemetry / 02.07.2026 / 14:36 CET</p><h1 className="mt-3 text-3xl font-black uppercase sm:text-5xl">Preisleitstand</h1></div><button type="button" className="min-h-11 border border-[#d8ff3e] bg-[#d8ff3e] px-5 font-mono text-xs font-bold uppercase text-[#10130f] transition hover:bg-transparent hover:text-[#d8ff3e]">Scan starten →</button></header>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Kennzahlen">
          {[['Quellen aktiv', '12 / 12', '100 % ABDECKUNG'], ['Preisrisiken', '02', '−01 SEIT 08:00'], ['Marktvorteil', '+3,8 %', '30-TAGE-MITTEL'], ['Nächster Lauf', '05:24:18', 'AUTO / 12 STUNDEN']].map(([label, value, detail], index) => <article key={label} className="relative overflow-hidden border border-[#3a4234] bg-[#171b15] p-5"><span className={`absolute inset-x-0 top-0 h-[3px] ${index === 1 ? 'bg-[#ff6b4a]' : index === 2 ? 'bg-[#34d3a3]' : 'bg-[#d8ff3e]'}`} /><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#899382]">{label}</p><p className="mt-5 font-mono text-3xl font-bold">{value}</p><p className="mt-3 font-mono text-[9px] text-[#687261]">{detail}</p></article>)}
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_22rem]">
          <div className="border border-[#3a4234] bg-[#151914]">
            <div className="flex flex-col justify-between gap-4 border-b border-[#3a4234] px-5 py-4 sm:flex-row sm:items-center"><div><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#899382]">MKT-01 / Live position</p><h2 className="mt-1 text-lg font-bold uppercase">Preisabweichungen</h2></div><div className="flex gap-1"><button type="button" className="min-h-9 border border-[#4a5344] bg-[#252c21] px-3 font-mono text-[10px]">ALLE 24</button><button type="button" className="min-h-9 border border-[#ff6b4a]/60 px-3 font-mono text-[10px] text-[#ff896f]">KRITISCH 02</button></div></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left"><thead className="bg-[#1c2119] font-mono text-[9px] uppercase tracking-[0.12em] text-[#737d6d]"><tr>{['ID / Produkt', 'Unser Preis', 'Markt-Tief', 'Delta', 'Quelle', 'Signal'].map((head) => <th key={head} className="border-b border-[#3a4234] px-5 py-3 font-medium">{head}</th>)}</tr></thead><tbody>{products.map((product, index) => <tr key={product.sku} className="border-b border-[#2b3128] last:border-b-0 hover:bg-[#1c2119]"><td className="px-5 py-4"><p className="text-sm font-semibold">{product.name}</p><p className="mt-1 font-mono text-[9px] text-[#697263]">{String(index + 1).padStart(2, '0')} · {product.sku}</p></td><td className="px-5 py-4 font-mono text-xs">{product.own}</td><td className="px-5 py-4 font-mono text-xs">{product.market}</td><td className={`px-5 py-4 font-mono text-xs font-bold ${product.delta.startsWith('-') ? 'text-[#ff7c61]' : 'text-[#34d3a3]'}`}>{product.delta}</td><td className="px-5 py-4 text-xs text-[#a7b0a0]">{product.source}</td><td className="px-5 py-4"><Trend positive={!product.delta.startsWith('-')} dark /></td></tr>)}</tbody></table></div>
          </div>

          <aside className="space-y-5">
            <section className="border border-[#ff6b4a]/55 bg-[#1b1714]"><div className="border-b border-[#ff6b4a]/35 px-5 py-4"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#ff896f]">Attention queue</p><h2 className="mt-1 font-bold uppercase">Offene Signale</h2></div><div className="divide-y divide-[#3f302a]">{products.filter((product) => product.state !== 'Stabil').map((product, index) => <div key={product.sku} className="p-5"><div className="flex items-start justify-between gap-3"><span className="font-mono text-[9px] text-[#ff896f]">AL-{String(index + 1).padStart(3, '0')}</span><span className="font-mono text-[9px] text-[#73665e]">VOR {index + 1}H</span></div><p className="mt-3 text-sm font-semibold">{product.name}</p><p className="mt-1 text-xs text-[#9e928a]">{product.source} liegt {product.delta.replace('-', '')} niedriger.</p><button type="button" className="mt-4 font-mono text-[10px] font-bold text-[#d8ff3e]">PRÜFEN →</button></div>)}</div></section>
            <section className="border border-[#3a4234] bg-[#151914] p-5"><div className="flex items-center justify-between"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#899382]">Scrape throughput</p><span className="font-mono text-[10px] text-[#34d3a3]">98,6 %</span></div><div className="mt-5"><MiniBars color="#34d3a3" /></div></section>
          </aside>
        </section>
      </div>
    </main>
  )
}

function LedgerConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#f3efe5] text-[#182b49] [background-image:radial-gradient(rgba(24,43,73,.08)_0.7px,transparent_0.7px)] [background-size:5px_5px]">
      <header className="border-b-2 border-[#182b49] bg-[#f3efe5]">
        <div className="mx-auto grid max-w-[1500px] items-center gap-4 px-5 py-5 sm:grid-cols-[1fr_auto_1fr] lg:px-10"><p className="hidden font-mono text-[10px] uppercase tracking-[0.15em] sm:block">Donnerstag, 2. Juli 2026</p><Link href="/design-lab/ledger" className="text-center font-serif text-2xl font-bold">The PriceVault Ledger</Link><div className="flex justify-end gap-4 text-xs font-semibold"><Link href="/dashboard/wiki">Referenz</Link><Link href="/dashboard/settings">Konto</Link></div></div>
        <nav className="no-scrollbar mx-auto flex max-w-[1500px] justify-start overflow-x-auto border-t border-[#182b49]/30 px-5 sm:justify-center lg:px-10" aria-label="Hauptnavigation">{nav.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`shrink-0 px-5 py-3 text-xs font-bold uppercase ${index === 0 ? 'bg-[#182b49] text-[#f3efe5]' : 'hover:bg-white/55'}`}>{item}</a>)}</nav>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-10 lg:py-12">
        <header className="grid gap-6 border-b-4 border-[#182b49] pb-7 lg:grid-cols-[1fr_24rem] lg:items-end"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#d94a35]">Marktbericht Nr. 184</p><h1 className="mt-3 max-w-4xl font-serif text-4xl font-bold leading-[.95] sm:text-6xl">Zwei Preise geraten heute unter Druck.</h1></div><div className="border-l-2 border-[#e0ad24] pl-5"><p className="text-sm font-bold uppercase">Kurzlage</p><p className="mt-2 text-sm leading-6 text-[#516079]">SneakerWorld unterbietet den Air Max deutlich. Die übrige Marktposition bleibt stabil.</p></div></header>

        <section className="grid border-b-2 border-[#182b49] sm:grid-cols-2 xl:grid-cols-4" aria-label="Kennzahlen">{[['24', 'Preise beobachtet'], ['2', 'Akute Abweichungen'], ['+3,8 %', 'Mittlerer Vorteil'], ['98,6 %', 'Quellen erreichbar']].map(([value, label], index) => <article key={label} className={`px-5 py-7 ${index < 3 ? 'xl:border-r xl:border-[#182b49]/35' : ''} ${index % 2 === 0 ? 'sm:border-r sm:border-[#182b49]/35 xl:border-r' : ''} ${index < 2 ? 'border-b border-[#182b49]/35 xl:border-b-0' : ''}`}><p className="font-serif text-4xl font-bold">{value}</p><p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f6d82]">{label}</p></article>)}</section>

        <section className="grid gap-8 border-b-2 border-[#182b49] py-8 xl:grid-cols-[1.4fr_.6fr]">
          <div><div className="flex items-baseline justify-between border-b border-[#182b49] pb-3"><h2 className="font-serif text-2xl font-bold">Die wichtigsten Preisbewegungen</h2><span className="font-mono text-[9px] uppercase">Sortiert nach Delta</span></div><div className="divide-y divide-[#182b49]/30">{products.slice(0, 4).map((product, index) => <article key={product.sku} className="grid gap-4 py-5 sm:grid-cols-[2rem_1fr_auto] sm:items-center"><span className="font-serif text-2xl italic text-[#d94a35]">{index + 1}</span><div><h3 className="font-serif text-xl font-bold">{product.name}</h3><p className="mt-1 text-xs text-[#5d6a7d]">{product.source} · {product.sku}</p></div><div className="flex items-center gap-5 sm:text-right"><div><p className={`font-mono text-sm font-bold ${product.delta.startsWith('-') ? 'text-[#d94a35]' : 'text-[#16755b]'}`}>{product.delta}</p><p className="mt-1 text-[10px] text-[#6e7989]">{product.market}</p></div><Trend positive={!product.delta.startsWith('-')} /></div></article>)}</div></div>
          <aside className="border-2 border-[#182b49] bg-[#efe4c8] p-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#d94a35]">Analyse des Tages</p><h2 className="mt-4 font-serif text-3xl font-bold leading-tight">Die Marge hält, doch der Abstand wächst.</h2><p className="mt-4 text-sm leading-6 text-[#46566e]">Seit Montag ist der Marktpreis des Air Max 90 um weitere 4,20 € gefallen. Eine Anpassung auf 139,00 € würde den Abstand halbieren, ohne die Zielmarge zu unterschreiten.</p><div className="mt-6 border-y border-[#182b49]/35 py-4"><p className="font-mono text-[9px] uppercase text-[#637087]">Empfohlener Korridor</p><p className="mt-1 font-serif text-3xl font-bold">137–141 €</p></div><button type="button" className="mt-5 min-h-11 w-full bg-[#182b49] px-4 text-xs font-bold uppercase text-[#f3efe5]">Produkt analysieren →</button></aside>
        </section>

        <section className="grid gap-8 py-8 lg:grid-cols-[1fr_1fr]"><div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#637087]">Marktbewegung / 14 Tage</p><h2 className="mt-2 font-serif text-2xl font-bold">Der Preisindex steigt moderat</h2><div className="mt-6 border-b border-l border-[#182b49]/35 p-4"><div className="flex h-36 items-end gap-2">{[44, 49, 46, 52, 58, 55, 63, 67, 61, 70, 74, 71, 78, 82].map((height, index) => <span key={`${height}-${index}`} className="flex-1 bg-[#e0ad24]" style={{ height: `${height}%` }} />)}</div></div></div><div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#637087]">Quellenlage</p><h2 className="mt-2 font-serif text-2xl font-bold">Alle zwölf Quellen liefern Daten</h2><div className="mt-6 grid grid-cols-2 border-l border-t border-[#182b49]/35">{['SneakerWorld', 'Urban Kicks', 'Solebox', 'Run Supply', 'Trail Dept.', '+7 weitere'].map((source, index) => <div key={source} className="flex items-center justify-between border-b border-r border-[#182b49]/35 p-4 text-xs font-bold"><span>{source}</span><span className={`h-2 w-2 rounded-full ${index === 3 ? 'bg-[#e0ad24]' : 'bg-[#16755b]'}`} /></div>)}</div></div></section>
      </div>
    </main>
  )
}

export type ConceptName = 'hygraph' | 'vercel' | 'control-room' | 'ledger' | AdditionalConceptName | SpecializedConceptName

export function ConceptPreview({ concept }: { concept: ConceptName }) {
  switch (concept) {
    case 'hygraph':
      return <HygraphConcept />
    case 'vercel':
      return <VercelConcept />
    case 'control-room':
      return <ControlRoomConcept />
    case 'ledger':
      return <LedgerConcept />
    case 'swiss-grid':
    case 'focus-console':
    case 'blueprint':
    case 'commerce-desk':
    case 'soft-console':
    case 'brutalist-ops':
      return <AdditionalConceptPreview concept={concept} />
    default:
      return <SpecializedConceptPreview concept={concept} />
  }
}
