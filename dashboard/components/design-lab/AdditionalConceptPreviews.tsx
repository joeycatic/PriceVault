import Link from 'next/link'

const rows = [
  { product: 'Nike Air Max 90', source: 'SneakerWorld', own: '149,90 €', market: '132,00 €', delta: '-11,9 %', risk: true },
  { product: 'Adidas Samba OG', source: 'Urban Kicks', own: '119,00 €', market: '115,50 €', delta: '-2,9 %', risk: true },
  { product: 'New Balance 550', source: 'Solebox', own: '139,95 €', market: '144,00 €', delta: '+2,9 %', risk: false },
  { product: 'Asics Gel-Kayano 14', source: 'Run Supply', own: '169,90 €', market: '159,99 €', delta: '-5,8 %', risk: true },
  { product: 'Salomon XT-6', source: 'Trail Dept.', own: '180,00 €', market: '184,95 €', delta: '+2,8 %', risk: false },
]

const sections = ['Übersicht', 'Produkte', 'Mitbewerber', 'Alarme', 'Reports']

function Bars({ color = 'bg-current' }: { color?: string }) {
  return (
    <div className="flex h-24 items-end gap-1" aria-label="Preisindex der letzten 14 Tage">
      {[36, 44, 40, 53, 49, 61, 58, 69, 64, 76, 71, 82, 78, 90].map((height, index) => (
        <span key={`${height}-${index}`} className={`min-w-1 flex-1 ${color}`} style={{ height: `${height}%`, opacity: 0.32 + index * 0.045 }} />
      ))}
    </div>
  )
}

function SwissGridConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#f5f4ef] text-[#111]">
      <header className="grid border-b-2 border-black md:grid-cols-[11rem_1fr_auto]">
        <div className="flex items-center bg-[#e5362f] px-5 py-4 text-xl font-black text-white">PV/05</div>
        <nav className="no-scrollbar flex overflow-x-auto" aria-label="Hauptnavigation">
          {sections.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`shrink-0 border-r border-black px-5 py-5 text-xs font-bold uppercase ${index === 0 ? 'bg-black text-white' : 'hover:bg-[#ffd633]'}`}>{item}</a>)}
        </nav>
        <Link href="/dashboard/settings" className="hidden items-center border-l border-black px-6 text-xs font-bold uppercase md:flex">Konto ↗</Link>
      </header>

      <div className="grid lg:grid-cols-[11rem_1fr]">
        <aside className="hidden border-r-2 border-black px-5 py-8 lg:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Marktlage</p>
          <p className="mt-5 [writing-mode:vertical-rl] rotate-180 text-5xl font-black uppercase leading-none">Smokeify Store</p>
        </aside>
        <div className="min-w-0">
          <header className="grid border-b-2 border-black lg:grid-cols-[1fr_22rem]">
            <div className="p-6 sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e5362f]">Donnerstag / 14:36 / Live</p><h1 className="mt-5 max-w-4xl text-4xl font-black uppercase leading-[.88] sm:text-7xl">Preise.<br />Position.<br />Entscheidung.</h1></div>
            <div className="border-t-2 border-black bg-[#ffd633] p-6 lg:border-l-2 lg:border-t-0 lg:p-8"><p className="text-xs font-bold uppercase">Heute kritisch</p><p className="mt-6 text-8xl font-black leading-none">02</p><p className="mt-5 text-sm font-semibold leading-5">Zwei Produkte liegen mehr als 5 % über dem besten Marktpreis.</p><button type="button" className="mt-8 min-h-11 w-full border-2 border-black bg-black px-4 text-xs font-bold uppercase text-white hover:bg-[#e5362f]">Fälle öffnen →</button></div>
          </header>

          <section className="grid border-b-2 border-black sm:grid-cols-3" aria-label="Kennzahlen">
            {[['24', 'Preise aktiv'], ['+3,8 %', 'Marktvorteil'], ['98,6 %', 'Quellen gesund']].map(([value, label]) => <article key={label} className="border-b border-black p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-4xl font-black">{value}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em]">{label}</p></article>)}
          </section>

          <section className="grid xl:grid-cols-[1fr_19rem]">
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b-2 border-black text-[10px] uppercase"><th className="p-4">Produkt</th><th className="p-4">Unser Preis</th><th className="p-4">Markt</th><th className="p-4">Delta</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.product} className="border-b border-black/40 hover:bg-white"><td className="p-4"><span className="mr-4 font-mono text-xs text-[#e5362f]">0{index + 1}</span><strong>{row.product}</strong><span className="ml-3 text-xs text-black/50">{row.source}</span></td><td className="p-4 font-mono text-sm">{row.own}</td><td className="p-4 font-mono text-sm">{row.market}</td><td className={`p-4 font-mono text-sm font-bold ${row.risk ? 'text-[#d52e28]' : 'text-[#087c55]'}`}>{row.delta}</td></tr>)}</tbody></table></div>
            <aside className="border-t-2 border-black bg-[#1268d8] p-6 text-white xl:border-l-2 xl:border-t-0"><p className="text-[10px] font-bold uppercase tracking-[0.17em]">14-Tage-Index</p><p className="mt-3 text-4xl font-black">104,2</p><div className="mt-8"><Bars color="bg-white" /></div><p className="mt-5 text-xs leading-5 text-white/75">Marktpreise steigen im Mittel um 1,4 %. Deine Position verbessert sich.</p></aside>
          </section>
        </div>
      </div>
    </main>
  )
}

function FocusConsoleConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#0f1014] text-[#ececf1]">
      <div className="grid min-h-[calc(100vh-3rem)] lg:grid-cols-[14rem_1fr]">
        <aside className="border-b border-white/10 bg-[#15161c] p-4 lg:border-b-0 lg:border-r lg:p-5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-md bg-[#8b6cff] text-xs font-black">PV</span><span className="text-sm font-semibold">PriceVault</span></div><span className="text-white/35">⌘</span></div>
          <nav className="no-scrollbar mt-5 flex gap-1 overflow-x-auto lg:mt-10 lg:flex-col" aria-label="Hauptnavigation">{sections.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`shrink-0 rounded-md px-3 py-2.5 text-sm ${index === 0 ? 'bg-[#292633] font-medium text-white' : 'text-white/45 hover:bg-white/5 hover:text-white'}`}><span className="mr-3 text-[10px] text-white/25">0{index + 1}</span>{item}</a>)}</nav>
          <div className="mt-8 hidden border-t border-white/10 pt-5 lg:block"><p className="text-[10px] uppercase tracking-[0.15em] text-white/25">Workspace</p><p className="mt-3 text-sm font-medium">Smokeify Store</p><p className="mt-1 text-xs text-[#61d6a0]">● Alle Systeme aktiv</p></div>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-5 lg:px-8"><p className="text-xs text-white/40">Workspace / <strong className="text-white/80">Marktmonitor</strong></p><div className="flex gap-2"><button type="button" className="hidden min-h-9 rounded-md border border-white/10 bg-white/[.03] px-4 text-xs text-white/50 sm:block">Suchen &nbsp; ⌘K</button><Link href="/dashboard/settings" className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-white/55" aria-label="Einstellungen">⚙</Link></div></header>
          <div className="mx-auto max-w-[1300px] px-5 py-8 lg:px-8">
            <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-medium text-[#9d89ff]">MARKTPOSITION</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Überblick</h1><p className="mt-2 text-sm text-white/40">Ruhige Oberfläche für schnelle tägliche Entscheidungen.</p></div><button type="button" className="min-h-10 rounded-md bg-[#ececf1] px-4 text-sm font-semibold text-[#111217]">Scan starten</button></header>

            <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Kennzahlen">{[['24', 'Produkte'], ['02', 'Kritisch'], ['+3,8 %', 'Preisvorteil'], ['98,6 %', 'Erreichbar']].map(([value, label], index) => <article key={label} className="rounded-md border border-white/10 bg-[#15161c] p-5"><div className="flex justify-between"><p className="text-xs text-white/35">{label}</p><span className={`h-2 w-2 rounded-full ${index === 1 ? 'bg-[#ff776d]' : 'bg-[#61d6a0]'}`} /></div><p className="mt-5 text-3xl font-semibold">{value}</p></article>)}</section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
              <div className="overflow-hidden rounded-md border border-white/10 bg-[#15161c]"><div className="flex items-center justify-between border-b border-white/10 p-5"><div><h2 className="text-sm font-semibold">Produkte mit Bewegung</h2><p className="mt-1 text-xs text-white/35">Nach Abweichung sortiert</p></div><button type="button" className="text-xs text-[#9d89ff]">Alle anzeigen →</button></div><div className="divide-y divide-white/10">{rows.map((row) => <div key={row.product} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 sm:grid-cols-[1fr_7rem_7rem] sm:items-center"><div><p className="text-sm font-medium">{row.product}</p><p className="mt-1 text-xs text-white/30">{row.source}</p></div><p className="hidden font-mono text-xs text-white/45 sm:block">{row.market}</p><p className={`text-right font-mono text-xs font-semibold ${row.risk ? 'text-[#ff776d]' : 'text-[#61d6a0]'}`}>{row.delta}</p></div>)}</div></div>
              <div className="space-y-5"><article className="rounded-md border border-white/10 bg-[#15161c] p-5"><p className="text-xs text-white/35">Preisindex</p><div className="mt-4 text-[#9d89ff]"><Bars /></div></article><article className="rounded-md border border-[#8b6cff]/35 bg-[#8b6cff]/10 p-5"><p className="text-xs font-semibold text-[#b6a7ff]">Nächste Aktion</p><h2 className="mt-3 text-lg font-semibold">Air Max 90 prüfen</h2><p className="mt-2 text-sm leading-5 text-white/45">Der Marktpreis liegt 17,90 € unter deinem Angebot.</p><button type="button" className="mt-5 text-xs font-semibold text-[#b6a7ff]">Analyse öffnen →</button></article></div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function BlueprintConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#0c4fa3] text-[#f1f7ff] [background-image:linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:32px_32px]">
      <header className="border-b border-white/45 bg-[#0b4690]/95 px-5 py-4 lg:px-8"><div className="mx-auto flex max-w-[1500px] items-center justify-between"><div className="flex items-center gap-4"><span className="border border-white px-2 py-1 font-mono text-xs font-bold">PV—07</span><p className="font-mono text-xs uppercase tracking-[0.17em]">Price intelligence schematic</p></div><Link href="/dashboard/settings" className="font-mono text-xs uppercase">Settings [S]</Link></div></header>
      <nav className="no-scrollbar border-b border-white/45 bg-[#0b4690]/80 px-5 lg:px-8" aria-label="Hauptnavigation"><div className="mx-auto flex max-w-[1500px] overflow-x-auto">{sections.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`shrink-0 border-x border-white/30 px-5 py-3 font-mono text-[10px] uppercase ${index === 0 ? 'bg-white text-[#0c4fa3]' : 'hover:bg-white/10'}`}>0{index + 1}.{item}</a>)}</div></nav>

      <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        <header className="grid gap-6 border border-white/55 bg-[#0c4fa3]/80 p-5 lg:grid-cols-[1fr_auto] lg:items-end lg:p-8"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em]">Sheet PV-MKT-184 / Revision 02</p><h1 className="mt-4 text-4xl font-light uppercase tracking-[0.08em] sm:text-6xl">Market blueprint</h1><p className="mt-3 max-w-2xl font-mono text-xs leading-5 text-white/65">Technische Ansicht aller Preisbeziehungen, Quellenzustände und Abweichungen.</p></div><div className="border border-white p-4 font-mono text-xs"><p>STATUS: LIVE</p><p className="mt-2">STAMP: 14:36:08</p><p className="mt-2">SOURCES: 12/12</p></div></header>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_20rem]">
          <div className="border border-white/55 bg-[#0c4fa3]/85">
            <div className="flex justify-between border-b border-white/40 p-4 font-mono text-[10px] uppercase"><span>Figure A / Price topology</span><span>Scale 1:24</span></div>
            <div className="grid gap-px bg-white/35 sm:grid-cols-2 lg:grid-cols-4">{[['24', 'Nodes'], ['02', 'Conflicts'], ['+3.8', 'Advantage'], ['98.6', 'Uptime']].map(([value, label]) => <article key={label} className="bg-[#0c4fa3] p-5"><p className="font-mono text-3xl">{value}</p><p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/65">{label}</p></article>)}</div>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] font-mono text-xs"><thead><tr className="border-b border-white/40 text-left text-[9px] uppercase text-white/60"><th className="p-4">Node</th><th className="p-4">Reference</th><th className="p-4">Observed</th><th className="p-4">Variance</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.product} className="border-b border-white/25 last:border-b-0 hover:bg-white/10"><td className="p-4"><span className="mr-3 text-white/45">N-{index + 101}</span>{row.product}</td><td className="p-4">{row.own}</td><td className="p-4">{row.market}</td><td className="p-4"><span className={`border px-2 py-1 ${row.risk ? 'border-[#ffcf42] text-[#ffdf7d]' : 'border-[#79f0c0] text-[#9ff5d2]'}`}>{row.delta}</span></td></tr>)}</tbody></table></div>
          </div>
          <aside className="space-y-5"><div className="border border-white/55 bg-[#0c4fa3]/85 p-5"><div className="flex justify-between font-mono text-[9px] uppercase"><span>Figure B</span><span>Index curve</span></div><div className="mt-6"><Bars color="bg-white" /></div></div><div className="border border-[#ffcf42] bg-[#0c4fa3]/90 p-5 text-[#ffdf7d]"><p className="font-mono text-[10px] uppercase">Exception E-02</p><p className="mt-4 text-lg font-medium text-white">Preisabstand außerhalb der Toleranz.</p><p className="mt-3 font-mono text-xs leading-5 text-white/65">AIR MAX 90 / −11.9 % / ACTION REQUIRED</p><button type="button" className="mt-5 min-h-10 border border-[#ffcf42] px-4 font-mono text-[10px] uppercase hover:bg-[#ffcf42] hover:text-[#0c4fa3]">Inspect node →</button></div></aside>
        </section>
      </div>
    </main>
  )
}

function CommerceDeskConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#f4f6f1] text-[#18332b]">
      <header className="bg-[#123d32] text-white"><div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-md bg-[#f3c64d] text-xs font-black text-[#123d32]">PV</span><div><p className="text-sm font-bold">Smokeify Store</p><p className="text-[10px] text-white/50">Commerce Operations</p></div></div><div className="flex items-center gap-4 text-xs"><span className="hidden text-white/55 sm:block">Letzter Lauf vor 12 Min.</span><Link href="/dashboard/settings" className="min-h-9 rounded-md border border-white/20 px-3 py-2">Einstellungen</Link></div></div><nav className="no-scrollbar mx-auto flex max-w-[1500px] overflow-x-auto px-5 lg:px-8" aria-label="Hauptnavigation">{sections.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`shrink-0 border-b-2 px-4 py-3 text-xs font-semibold ${index === 0 ? 'border-[#f3c64d] text-white' : 'border-transparent text-white/55 hover:text-white'}`}>{item}</a>)}</nav></header>

      <div className="mx-auto max-w-[1400px] px-5 py-8 lg:px-8">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b04a32]">Tagesgeschäft</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Preissteuerung</h1><p className="mt-2 text-sm text-[#63756f]">Was heute entschieden, beobachtet oder freigegeben werden muss.</p></div><button type="button" className="min-h-10 rounded-md bg-[#123d32] px-4 text-sm font-semibold text-white">+ Neue Überwachung</button></header>

        <section className="mt-7 grid gap-3 lg:grid-cols-3" aria-label="Arbeitswarteschlange">{[['2 Entscheidungen', 'Preisabstand größer als 5 %', '#d85a3c'], ['1 Quelle prüfen', 'Run Supply antwortet langsam', '#e4a72e'], ['9 Preisführer', 'Kein Eingriff erforderlich', '#278866']].map(([title, detail, color]) => <article key={title} className="rounded-md border border-[#cad2c8] bg-white p-5" style={{ boxShadow: `inset 4px 0 0 ${color}` }}><p className="font-semibold">{title}</p><p className="mt-2 text-sm text-[#6f7f79]">{detail}</p></article>)}</section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_21rem]">
          <div className="overflow-hidden rounded-md border border-[#cad2c8] bg-white"><div className="flex flex-col justify-between gap-3 border-b border-[#dfe4dd] p-5 sm:flex-row sm:items-center"><div><h2 className="font-semibold">Sortimentsübersicht</h2><p className="mt-1 text-xs text-[#74827d]">24 Produkte · 12 aktive Quellen</p></div><div className="flex gap-2"><button type="button" className="min-h-9 rounded-md border border-[#cad2c8] px-3 text-xs">Filtern</button><button type="button" className="min-h-9 rounded-md border border-[#cad2c8] px-3 text-xs">Export</button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#f7f8f5] text-[10px] uppercase text-[#72817b]"><tr><th className="p-4">Produkt</th><th className="p-4">Unser Preis</th><th className="p-4">Marktpreis</th><th className="p-4">Differenz</th><th className="p-4">Aktion</th></tr></thead><tbody>{rows.map((row) => <tr key={row.product} className="border-t border-[#e4e8e2] hover:bg-[#f9faf7]"><td className="p-4"><p className="font-semibold">{row.product}</p><p className="mt-1 text-xs text-[#82908b]">{row.source}</p></td><td className="p-4">{row.own}</td><td className="p-4">{row.market}</td><td className={`p-4 font-semibold ${row.risk ? 'text-[#c34730]' : 'text-[#23805f]'}`}>{row.delta}</td><td className="p-4"><button type="button" className="text-xs font-semibold text-[#246b58]">Öffnen →</button></td></tr>)}</tbody></table></div></div>
          <aside className="space-y-5"><article className="rounded-md border border-[#cad2c8] bg-white p-5"><p className="text-xs font-semibold text-[#61736c]">30-Tage-Leistung</p><div className="mt-5 text-[#278866]"><Bars /></div><div className="mt-4 flex justify-between text-xs"><span className="text-[#71817b]">Preisvorteil</span><strong>+3,8 %</strong></div></article><article className="rounded-md border border-[#ead7a1] bg-[#fff5d8] p-5"><p className="text-xs font-bold uppercase text-[#8b6819]">Nächster Report</p><p className="mt-3 text-lg font-semibold">Montag, 08:00</p><p className="mt-2 text-sm text-[#756437]">PDF und CSV an 3 Empfänger.</p><button type="button" className="mt-4 text-xs font-bold text-[#75530a]">Plan bearbeiten →</button></article></aside>
        </section>
      </div>
    </main>
  )
}

function SoftConsoleConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#f7f3f4] text-[#29252b]">
      <div className="grid min-h-[calc(100vh-3rem)] lg:grid-cols-[15rem_1fr]">
        <aside className="border-b border-[#ded7dc] bg-[#fffdfd] p-4 lg:border-b-0 lg:border-r lg:p-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#ef6f61] text-xs font-black text-white">PV</span><span className="font-bold">PriceVault</span></div><span className="text-xs text-[#958d93]">PRO</span></div><nav className="no-scrollbar mt-6 flex gap-2 overflow-x-auto lg:mt-10 lg:flex-col" aria-label="Hauptnavigation">{sections.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`shrink-0 rounded-lg px-4 py-3 text-sm ${index === 0 ? 'bg-[#fce5e1] font-semibold text-[#a63d33]' : 'text-[#746c72] hover:bg-[#f7f3f4]'}`}>{item}</a>)}</nav><div className="mt-8 hidden rounded-lg bg-[#e5f3ec] p-4 lg:block"><p className="text-xs font-semibold text-[#2d7459]">Alles im Blick</p><p className="mt-2 text-xs leading-5 text-[#5a7c6f]">12 von 12 Quellen liefern aktuelle Preise.</p></div></aside>
        <section className="min-w-0"><header className="flex min-h-16 items-center justify-between border-b border-[#ded7dc] bg-white/70 px-5 lg:px-8"><p className="text-sm font-semibold">Smokeify Store</p><div className="flex items-center gap-3"><button type="button" className="hidden min-h-9 rounded-lg border border-[#ded7dc] bg-white px-3 text-xs text-[#756d73] sm:block">⌕ Suchen</button><Link href="/dashboard/settings" className="grid h-9 w-9 place-items-center rounded-lg border border-[#ded7dc] bg-white" aria-label="Einstellungen">⚙</Link></div></header>
          <div className="mx-auto max-w-[1300px] px-5 py-8 lg:px-8"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#ef6f61]">Dein Preisradar</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Guten Morgen, Joey</h1><p className="mt-2 text-sm text-[#7f777d]">Hier ist die Lage in deinem Sortiment.</p></div><button type="button" className="min-h-10 rounded-lg bg-[#29252b] px-4 text-sm font-semibold text-white">Preise aktualisieren</button></header>
            <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Kennzahlen">{[['24', 'Preise im Blick', '#fce5e1'], ['2', 'Brauchen Aufmerksamkeit', '#fff0cd'], ['9', 'Sind Preisführer', '#e5f3ec'], ['98,6 %', 'Laufen zuverlässig', '#e8e8f7']].map(([value, label, color]) => <article key={label} className="rounded-lg border border-[#ded7dc] p-5" style={{ backgroundColor: color }}><p className="text-3xl font-bold">{value}</p><p className="mt-2 text-xs text-[#70686e]">{label}</p></article>)}</section>
            <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_19rem]"><div className="rounded-lg border border-[#ded7dc] bg-white"><div className="flex items-center justify-between border-b border-[#ebe6e9] p-5"><div><h2 className="font-semibold">Was sich bewegt</h2><p className="mt-1 text-xs text-[#8a8288]">Aktuelle Preisänderungen</p></div><button type="button" className="text-xs font-semibold text-[#b3483e]">Alle Produkte</button></div><div className="divide-y divide-[#ebe6e9]">{rows.map((row) => <div key={row.product} className="flex items-center justify-between gap-4 p-4 sm:px-5"><div><p className="text-sm font-semibold">{row.product}</p><p className="mt-1 text-xs text-[#958d93]">{row.source} · {row.market}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.risk ? 'bg-[#fce5e1] text-[#b3483e]' : 'bg-[#e5f3ec] text-[#2d7459]'}`}>{row.delta}</span></div>)}</div></div><aside className="rounded-lg border border-[#ded7dc] bg-[#302b33] p-5 text-white"><p className="text-xs text-white/50">Empfehlung</p><h2 className="mt-4 text-xl font-semibold">Air Max 90 zuerst prüfen</h2><p className="mt-3 text-sm leading-6 text-white/60">Der Abstand ist heute auf 11,9 % gestiegen.</p><div className="mt-8 text-[#f3a99f]"><Bars /></div><button type="button" className="mt-6 min-h-10 w-full rounded-lg bg-[#ef6f61] px-4 text-sm font-semibold">Analyse öffnen</button></aside></section>
          </div>
        </section>
      </div>
    </main>
  )
}

function BrutalistOpsConcept() {
  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#f0f0e8] text-black">
      <header className="border-b-4 border-black bg-[#f2ff48]"><div className="flex items-stretch justify-between"><div className="border-r-4 border-black px-5 py-4 text-xl font-black uppercase sm:text-2xl">PriceVault!</div><div className="hidden flex-1 items-center overflow-hidden px-5 font-mono text-xs uppercase md:flex">Live prices / no decoration / act on evidence / live prices / no decoration</div><Link href="/dashboard/settings" className="flex items-center border-l-4 border-black bg-white px-5 text-xs font-black uppercase">Account ↗</Link></div></header>
      <nav className="no-scrollbar flex overflow-x-auto border-b-4 border-black bg-white" aria-label="Hauptnavigation">{sections.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`shrink-0 border-r-4 border-black px-5 py-4 text-xs font-black uppercase ${index === 0 ? 'bg-black text-white' : 'hover:bg-[#ff5c39]'}`}>[{index + 1}] {item}</a>)}</nav>
      <div className="p-4 sm:p-7 lg:p-10">
        <header className="grid gap-0 border-4 border-black lg:grid-cols-[1fr_19rem]"><div className="bg-white p-5 sm:p-8"><p className="font-mono text-xs font-bold uppercase">Market status → 02.07.26</p><h1 className="mt-4 max-w-4xl text-5xl font-black uppercase leading-[.86] sm:text-7xl lg:text-8xl">Stop guessing.<br />Know prices.</h1></div><div className="border-t-4 border-black bg-[#ff5c39] p-6 lg:border-l-4 lg:border-t-0"><p className="text-sm font-black uppercase">Alarm</p><p className="mt-4 text-8xl font-black">02</p><p className="mt-4 text-sm font-bold">Produkte sind zu teuer. Jetzt handeln.</p></div></header>
        <section className="grid border-x-4 border-b-4 border-black sm:grid-cols-3" aria-label="Kennzahlen">{[['24', 'TRACKED'], ['+3.8%', 'ADVANTAGE'], ['98.6%', 'UPTIME']].map(([value, label], index) => <article key={label} className={`border-b-4 border-black p-5 last:border-b-0 sm:border-b-0 sm:border-r-4 sm:last:border-r-0 ${index === 1 ? 'bg-[#6ee7b7]' : 'bg-white'}`}><p className="text-4xl font-black">{value}</p><p className="mt-2 font-mono text-xs font-bold">{label}</p></article>)}</section>
        <section className="mt-7 grid gap-7 xl:grid-cols-[1fr_20rem]"><div className="border-4 border-black bg-white"><div className="flex flex-col justify-between gap-4 border-b-4 border-black bg-black p-4 text-white sm:flex-row sm:items-center"><h2 className="text-xl font-black uppercase">The price list</h2><button type="button" className="min-h-10 border-2 border-white px-4 text-xs font-black uppercase hover:bg-white hover:text-black">Export CSV</button></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="border-b-4 border-black font-mono text-xs uppercase"><th className="p-4">Product</th><th className="p-4">Ours</th><th className="p-4">Market</th><th className="p-4">Gap</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.product} className={`border-b-2 border-black last:border-b-0 ${index === 0 ? 'bg-[#ffd0c5]' : 'hover:bg-[#f2ff48]'}`}><td className="p-4 font-black uppercase">{row.product}<span className="ml-3 font-mono text-[10px] font-normal">{row.source}</span></td><td className="p-4 font-mono text-sm">{row.own}</td><td className="p-4 font-mono text-sm">{row.market}</td><td className="p-4 font-mono text-sm font-black">{row.delta}</td></tr>)}</tbody></table></div></div><aside><div className="border-4 border-black bg-[#1268d8] p-5 text-white"><p className="font-mono text-xs font-bold uppercase">Trend machine</p><div className="mt-6"><Bars color="bg-white" /></div></div><button type="button" className="mt-5 min-h-16 w-full border-4 border-black bg-[#f2ff48] px-4 text-lg font-black uppercase shadow-[6px_6px_0_#000] transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">Run scan →</button></aside></section>
      </div>
    </main>
  )
}

export type AdditionalConceptName = 'swiss-grid' | 'focus-console' | 'blueprint' | 'commerce-desk' | 'soft-console' | 'brutalist-ops'

export function AdditionalConceptPreview({ concept }: { concept: AdditionalConceptName }) {
  switch (concept) {
    case 'swiss-grid':
      return <SwissGridConcept />
    case 'focus-console':
      return <FocusConsoleConcept />
    case 'blueprint':
      return <BlueprintConcept />
    case 'commerce-desk':
      return <CommerceDeskConcept />
    case 'soft-console':
      return <SoftConsoleConcept />
    case 'brutalist-ops':
      return <BrutalistOpsConcept />
  }
}
