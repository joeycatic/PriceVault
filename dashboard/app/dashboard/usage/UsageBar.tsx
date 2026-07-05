import { Activity, CheckCircle2, Gauge, TriangleAlert } from 'lucide-react'

export function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const remaining = Math.max(0, limit - used)
  const gaugeColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#34d399'
  const status = pct >= 90 ? 'Fast ausgeschöpft' : pct >= 70 ? 'Kontingent wird knapp' : 'Im grünen Bereich'
  const StatusIcon = pct >= 70 ? TriangleAlert : CheckCircle2

  return (
    <div className="grid overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]" aria-label={`Nutzung ${pct} Prozent`}>
      <div className="p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-vault-500"><Activity className="h-4 w-4" aria-hidden="true" />Live-Verbrauch</p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-vault-100">Preisabrufe heute</h2>
            <p className="mt-2 text-sm leading-6 text-vault-500">Jeder gespeicherte Preis-Snapshot zählt gegen das tägliche Kontingent.</p>
          </div>
          <span className={`inline-flex min-h-8 items-center gap-2 self-start rounded-full border px-3 text-[10px] font-bold uppercase tracking-[0.08em] ${pct >= 90 ? 'border-red-200 bg-red-50 text-red-800' : pct >= 70 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {status}
          </span>
        </div>

        <div className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-5xl font-bold tracking-[-0.055em] text-vault-100 sm:text-6xl">{pct}<span className="ml-1 text-2xl text-vault-500">%</span></p>
              <p className="mt-2 font-mono text-xs text-vault-500">{used.toLocaleString('de-DE')} von {limit.toLocaleString('de-DE')} Abrufen</p>
            </div>
            <Gauge className="hidden h-8 w-8 text-vault-500 sm:block" aria-hidden="true" />
          </div>

          <div className="relative mt-7 pt-5">
            <div
              className="h-3 overflow-hidden rounded-sm bg-vault-800 shadow-inner"
              role="progressbar"
              aria-label="Verbrauchte Preisabrufe"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={Math.min(used, limit)}
            >
              <div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: gaugeColor }} />
            </div>
            <span className="absolute left-[70%] top-3 h-7 w-px bg-amber-500/70" aria-hidden="true" />
            <span className="absolute left-[90%] top-3 h-7 w-px bg-red-500/70" aria-hidden="true" />
            <div className="mt-3 flex justify-between font-mono text-[9px] text-vault-500">
              <span>0</span><span className="ml-auto mr-[16%]">70 %</span><span className="mr-[5%]">90 %</span><span>100 %</span>
            </div>
          </div>
        </div>
      </div>

      <aside className="relative flex flex-col justify-between overflow-hidden bg-vault-100 p-5 text-white sm:p-7">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-white/45">Noch verfügbar</p>
          <div className="mt-6 flex items-center justify-between gap-5">
            <div>
              <p className="text-4xl font-bold tracking-[-0.045em]">{remaining.toLocaleString('de-DE')}</p>
              <p className="mt-2 text-xs text-white/45">Abrufe bis zum Reset</p>
            </div>
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full p-2" style={{ background: `conic-gradient(${gaugeColor} ${pct * 3.6}deg, rgba(255,255,255,.1) 0deg)` }} aria-hidden="true">
              <div className="grid h-full w-full place-items-center rounded-full bg-vault-100 font-mono text-xs font-bold">{pct}%</div>
            </div>
          </div>
        </div>
        <div className="relative mt-8 border-t border-dashed border-white/15 pt-5">
          <div className="flex items-center justify-between text-xs"><span className="text-white/45">Tageslimit</span><strong className="font-mono">{limit.toLocaleString('de-DE')}</strong></div>
          <div className="mt-3 flex items-center justify-between text-xs"><span className="text-white/45">Reset</span><strong className="font-mono">00:00 UTC</strong></div>
        </div>
      </aside>
    </div>
  )
}
