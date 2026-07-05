import Link from 'next/link'
import { ArrowUpRight, BellRing, CalendarClock, Gauge, RotateCcw, ShieldCheck, Sparkles, Zap } from 'lucide-react'

import { backendFetch, currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'

import { UsageBar } from './UsageBar'

const PLAN_LIMITS = { free: 50, trial: 50, starter: 500, pro: 500, agency: 5000 }

export default async function UsagePage() {
  const supabase = await createClient()
  const tenant = await currentTenant()

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const { count } = tenant
    ? await supabase
        .from('price_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('scraped_at', today.toISOString())
    : { count: 0 }
  const plan = ((tenant?.plan as keyof typeof PLAN_LIMITS | null) ?? 'free')
  const limit = PLAN_LIMITS[plan]
  const used = count ?? 0
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const remaining = Math.max(0, limit - used)
  let summary: { measured: Record<string, number>; limits: Record<string, number | null> } | null = null
  if (tenant) {
    try {
      const response = await backendFetch('/usage/summary', tenant.id)
      if (response.ok) summary = await response.json()
    } catch { summary = null }
  }

  return (
    <>
      <div className="mb-7">
        <header className="relative overflow-hidden rounded-3xl border border-vault-100 bg-vault-100 text-white shadow-[0_24px_65px_rgba(48,48,48,0.18)]">
          <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:40px_40px]" aria-hidden="true" />
          <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                Plan / Nutzung
              </p>
              <h1 className="mt-5 max-w-2xl text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl lg:text-5xl">Dein Kontingent. Live.</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base">Sieh sofort, wie viele Preisabrufe heute verarbeitet wurden, wann Warnschwellen greifen und wie viel Kapazität noch bleibt.</p>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-xs text-white/55">
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />Messbetrieb ohne harte Sperre</span>
                <span className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-emerald-300" aria-hidden="true" />Täglicher Reset</span>
                <span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-300" aria-hidden="true" />Live gezählt</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">Kontingent-Pass</span>
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />Live</span>
              </div>
              <div className="p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-3xl font-bold capitalize tracking-[-0.04em]">{plan}</p>
                    <p className="mt-1 text-xs text-white/45">PriceVault Plan</p>
                  </div>
                  <p className="font-mono text-2xl font-bold text-emerald-300">{pct}%</p>
                </div>
                <div className="mt-5 border-t border-dashed border-white/15 pt-4">
                  <div className="flex items-center justify-between text-xs"><span className="text-white/45">Heute genutzt</span><strong className="font-mono">{used.toLocaleString('de-DE')}</strong></div>
                  <div className="mt-3 flex items-center justify-between text-xs"><span className="text-white/45">Noch verfügbar</span><strong className="font-mono">{remaining.toLocaleString('de-DE')}</strong></div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-300' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} /></div>
                </div>
              </div>
            </div>
          </div>
          <div className="relative flex h-1.5" aria-hidden="true"><span className="w-1/2 bg-emerald-400" /><span className="w-1/4 bg-amber-300" /><span className="flex-1 bg-white/15" /></div>
        </header>
      </div>

      <UsageBar used={used} limit={limit} />

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Gemessene Nutzung der letzten 30 Tage">
        {[
          ['Produkte', summary?.measured.products ?? 0, summary?.limits.products],
          ['Mitbewerber', summary?.measured.competitors ?? 0, summary?.limits.competitors],
          ['Preisabrufe', summary?.measured.scrapes ?? 0, null],
          ['Reports', summary?.measured.report_generations ?? 0, summary?.limits.reports],
          ['E-Mails', summary?.measured.emails ?? 0, summary?.limits.emails],
          ['Snapshots', summary?.measured.stored_snapshots ?? 0, summary?.limits.snapshot_retention_days],
        ].map(([label, value, metricLimit]) => <article key={String(label)} className="rounded-2xl border border-vault-700 bg-white p-5 shadow-panel"><p className="text-xs text-vault-500">{label}</p><p className="mt-2 text-2xl font-bold">{Number(value).toLocaleString('de-DE')}</p><p className="mt-1 text-xs text-vault-500">{label === 'Snapshots' ? `${metricLimit ?? 730} Tage Aufbewahrung` : metricLimit == null ? 'Aktuell ohne hartes Limit' : `Planwert ${Number(metricLimit).toLocaleString('de-DE')}`}</p></article>)}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="Kontingentregeln">
        <article className="relative overflow-hidden rounded-2xl border border-vault-700 bg-white p-5 pl-6 shadow-panel">
          <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden="true" />
          <BellRing className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          <p className="mt-5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500">Schwelle / 01</p>
          <h2 className="mt-2 font-bold text-vault-100">Warnung ab 70 %</h2>
          <p className="mt-2 text-sm leading-6 text-vault-500">Der Verbrauch wechselt in den Warnbereich, bevor das Tageslimit kritisch wird.</p>
        </article>
        <article className="relative overflow-hidden rounded-2xl border border-vault-700 bg-white p-5 pl-6 shadow-panel">
          <span className="absolute inset-y-0 left-0 w-1 bg-amber-400" aria-hidden="true" />
          <Zap className="h-5 w-5 text-amber-700" aria-hidden="true" />
          <p className="mt-5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500">Schwelle / 02</p>
          <h2 className="mt-2 font-bold text-vault-100">Messphase läuft</h2>
          <p className="mt-2 text-sm leading-6 text-vault-500">Harte Planlimits bleiben aus, bis 30 Tage repräsentative Produktionsmessung geprüft wurden.</p>
        </article>
        <article className="relative overflow-hidden rounded-2xl border border-vault-700 bg-white p-5 pl-6 shadow-panel">
          <span className="absolute inset-y-0 left-0 w-1 bg-sky-500" aria-hidden="true" />
          <CalendarClock className="h-5 w-5 text-sky-700" aria-hidden="true" />
          <p className="mt-5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-vault-500">Reset / UTC</p>
          <h2 className="mt-2 font-bold text-vault-100">Täglich um 00:00</h2>
          <p className="mt-2 text-sm leading-6 text-vault-500">Das komplette Tageskontingent steht nach dem UTC-Reset wieder zur Verfügung.</p>
        </article>
      </section>

      <section className="mt-6 flex flex-col justify-between gap-5 rounded-2xl border border-vault-700 bg-vault-100 p-5 text-white shadow-panel sm:flex-row sm:items-center sm:p-6">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">Mehr Kapazität</p>
          <h2 className="mt-2 text-xl font-bold">Passt das Tageslimit noch zu deinem Sortiment?</h2>
          <p className="mt-2 text-sm text-white/55">Vergleiche verfügbare Pläne und erhöhe dein tägliches Abrufkontingent.</p>
        </div>
        <Link href="/dashboard/settings/billing" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-vault-100 transition hover:bg-emerald-50">
          Pläne vergleichen
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </>
  )
}
