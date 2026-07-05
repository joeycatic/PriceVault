import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { Activity, BarChart3, CalendarClock, Download, FileText, Mail, PackageX, TrendingDown } from 'lucide-react'

import {
  HeroStat,
  IntegrationBadge,
  IntegrationHero,
  IntegrationSectionHeading,
} from '@/components/integrations/IntegrationUI'
import { MutationButton } from '@/components/ui/MutationButton'
import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan } from '@/lib/plan-gates'
import { createClient } from '@/lib/supabase/server'
import type { LatestPrice } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

import { ReportScheduleForm, type ReportActionState } from './ReportScheduleForm'

function reportBackendError(action: string, error: unknown): ReportActionState {
  console.error('[reports] backend request failed', { action, error })
  return {
    ok: false,
    message: 'Der Backend-Dienst ist nicht erreichbar. Bitte versuche es in Kürze erneut.',
  }
}

async function createSchedule(_state: ReportActionState, formData: FormData): Promise<ReportActionState> {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
  if (!hasPlan(tenant.plan, 'pro') || !['owner', 'admin'].includes(tenant.membership_role ?? 'owner')) {
    return { ok: false, message: 'Für diese Aktion fehlen Plan oder Berechtigung.' }
  }
  const recipients = String(formData.get('recipients') ?? '')
    .split(/[\n,;]/)
    .map((value) => value.trim())
    .filter(Boolean)
  let response: Response
  try {
    response = await backendFetch('/report-schedules', tenant.id, {
      method: 'POST',
      body: JSON.stringify({
        name: String(formData.get('name') ?? '').trim(),
        cadence: String(formData.get('cadence') ?? 'weekly'),
        recipients,
        include_csv: formData.get('include_csv') === 'on',
        filters: {},
      }),
    })
  } catch (error) {
    return reportBackendError('create_schedule', error)
  }
  if (!response.ok) return { ok: false, message: `Zeitplan konnte nicht gespeichert werden (${response.status}).` }
  revalidatePath('/dashboard/reports')
  return { ok: true, message: 'Zeitplan gespeichert.' }
}

async function sendNow(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
  const id = String(formData.get('id') ?? '')
  let response: Response
  try {
    response = await backendFetch(`/report-schedules/${id}/send-now`, tenant.id, { method: 'POST' })
  } catch (error) {
    return reportBackendError('send_now', error)
  }
  if (!response.ok) return { ok: false, message: 'Report konnte nicht eingeplant werden.' }
  revalidatePath('/dashboard/reports')
  return { ok: true, message: 'Report wurde eingeplant.' }
}

async function deleteSchedule(formData: FormData) {
  'use server'
  const tenant = await currentTenant()
  if (!tenant) return { ok: false, message: 'Kein Mandant eingerichtet.' }
  const id = String(formData.get('id') ?? '')
  let response: Response
  try {
    response = await backendFetch(`/report-schedules/${id}`, tenant.id, { method: 'DELETE' })
  } catch (error) {
    return reportBackendError('delete_schedule', error)
  }
  if (!response.ok) return { ok: false, message: 'Zeitplan konnte nicht gelöscht werden.' }
  revalidatePath('/dashboard/reports')
  return { ok: true, message: 'Zeitplan gelöscht.' }
}

export default async function ReportsPage() {
  const tenant = await currentTenant()
  const supabase = await createClient()
  const [latestResult, schedulesResult, runsResult] = tenant
    ? await Promise.all([
        supabase
          .from('v_latest_prices')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('delta_pct', { ascending: true }),
        supabase
          .from('report_schedules')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('report_runs')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const latest = (latestResult.data ?? []) as LatestPrice[]
  const schedules = schedulesResult.data ?? []
  const runs = runsResult.data ?? []
  const canManageReports = hasPlan(tenant?.plan, 'pro') && ['owner', 'admin'].includes(tenant?.membership_role ?? 'owner')
  const undercut = latest.filter((row) => Number(row.delta_pct ?? 0) < 0)
  const unavailable = latest.filter((row) => row.in_stock === false)
  const volatile = latest.filter((row) => Math.abs(Number(row.delta_pct ?? 0)) >= 10)

  return (
    <>
      <IntegrationHero
        eyebrow="Integrationen / Reports"
        title="Aus Preisdaten werden Updates."
        description={<>Bereite Preisabweichungen für {tenant?.shop_name ?? 'deinen Shop'} auf, automatisiere den Versand und exportiere genau die Zeilen, die dein Team braucht.</>}
        icon={BarChart3}
        backHref="/dashboard/settings/integrations"
        backLabel="Zur Integrationsübersicht"
      >
        <HeroStat label="Quellen" value={latest.length} tone="blue" />
        <HeroStat label="Unterboten" value={undercut.length} tone={undercut.length ? 'amber' : 'green'} />
        <HeroStat label="Nicht verfügbar" value={unavailable.length} tone={unavailable.length ? 'amber' : 'green'} />
        <HeroStat label="Zeitpläne" value={schedules.length} tone="violet" />
      </IntegrationHero>

      <section className="animate-reveal" aria-labelledby="report-table">
        <IntegrationSectionHeading
          eyebrow="Report-Basis"
          title="Was gerade berichtenswert ist"
          description="Die aktuelle Preisansicht bildet die Grundlage für Exporte und geplante Team-Updates."
          action={<IntegrationBadge tone={volatile.length ? 'amber' : 'green'}>{volatile.length ? `${volatile.length} starke Bewegungen` : 'Markt ruhig'}</IntegrationBadge>}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <TrendingDown className="h-5 w-5 text-amber-800" aria-hidden="true" />
            <p className="mt-4 text-2xl font-bold text-amber-950">{undercut.length}</p>
            <p className="mt-1 text-xs font-semibold text-amber-900/65">unterbotene Positionen</p>
          </article>
          <article className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <PackageX className="h-5 w-5 text-rose-800" aria-hidden="true" />
            <p className="mt-4 text-2xl font-bold text-rose-950">{unavailable.length}</p>
            <p className="mt-1 text-xs font-semibold text-rose-900/65">nicht verfügbare Angebote</p>
          </article>
          <article className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <Activity className="h-5 w-5 text-violet-800" aria-hidden="true" />
            <p className="mt-4 text-2xl font-bold text-violet-950">{volatile.length}</p>
            <p className="mt-1 text-xs font-semibold text-violet-900/65">Bewegungen über 10 %</p>
          </article>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.75fr)]">
        <section className="overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-panel" aria-labelledby="report-table">
          <div className="flex flex-col justify-between gap-3 border-b border-sky-200 bg-sky-50 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-800"><Download className="h-3.5 w-3.5" aria-hidden="true" />Export-Basis</p>
              <h2 id="report-table" className="mt-2 text-xl font-bold tracking-[-0.025em] text-sky-950">Aktuelle Report-Zeilen</h2>
            </div>
            <span className="rounded-full border border-sky-200 bg-white px-3 py-1.5 font-mono text-[10px] text-sky-900">{latest.length} DATENSÄTZE</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-vault-800 bg-white text-[10px] uppercase tracking-[0.08em] text-vault-500">
                <tr>
                  <th className="px-5 py-3">Produkt</th>
                  <th className="px-5 py-3">Mitbewerber</th>
                  <th className="px-5 py-3">Preis</th>
                  <th className="px-5 py-3">Delta</th>
                  <th className="px-5 py-3">Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vault-800">
                {latest.slice(0, 40).map((row) => (
                  <tr key={row.competitor_product_id} className="transition hover:bg-sky-50/50">
                    <td className="px-5 py-4 font-medium">{row.product_name}</td>
                    <td className="px-5 py-4 text-vault-300">{row.competitor_shop}</td>
                    <td className="px-5 py-4 font-mono">{row.competitor_price ?? '-'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 font-mono text-xs font-bold ${Number(row.delta_pct ?? 0) < 0 ? 'bg-rose-50 text-rose-800' : Number(row.delta_pct ?? 0) > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-vault-950 text-vault-500'}`}>
                        {row.delta_pct ?? '-'}%
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Link className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-xs font-bold text-sky-900 transition hover:bg-sky-100" href={`/api/export/csv?competitor_product_id=${row.competitor_product_id}`}>
                        <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
                      </Link>
                    </td>
                  </tr>
                ))}
                {!latest.length && (
                  <tr>
                    <td className="px-5 py-8 text-vault-400" colSpan={5}>Noch keine Reportdaten vorhanden.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-panel">
            <div className="relative overflow-hidden bg-violet-950 p-5 text-white sm:p-6">
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet-400/20 blur-3xl" aria-hidden="true" />
              <p className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-200/70">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Automation
              </p>
              <h2 className="relative mt-2 text-xl font-bold">Geplante Reports</h2>
              <p className="relative mt-2 text-xs leading-5 text-violet-100/60">Regelmäßige Markt-Updates ohne manuellen Export.</p>
            </div>
            <div className="p-5 sm:p-6">
            {canManageReports ? (
              <ReportScheduleForm action={createSchedule} />
            ) : (
              <p className="mt-4 text-sm text-vault-400">Geplante Reports können Owner und Admins ab dem Pro-Plan verwalten.</p>
            )}
            <div className="mt-4 space-y-3">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-bold text-violet-950"><Mail className="h-4 w-4" aria-hidden="true" />{schedule.name}</p>
                      <p className="mt-2 text-xs text-violet-900/70">
                        {schedule.cadence === 'weekly' ? 'Wöchentlich' : 'Monatlich'} · {schedule.include_csv ? 'E-Mail + CSV' : 'E-Mail'}
                      </p>
                      <p className="mt-1 text-xs text-violet-900/55">
                        Nächster Lauf: {schedule.next_run_at ? formatRelativeTime(schedule.next_run_at) : 'noch offen'}
                      </p>
                    </div>
                    {canManageReports && (
                      <div className="space-y-2 text-right">
                        <MutationButton id={schedule.id} label="Senden" pendingLabel="Wird eingeplant …" action={sendNow} tone="neutral" />
                        <MutationButton id={schedule.id} label="Löschen" pendingLabel="Wird gelöscht …" action={deleteSchedule} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!schedules.length && <p className="text-sm text-vault-400">Noch kein Zeitplan eingerichtet.</p>}
            </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-vault-700 bg-white shadow-panel">
            <div className="flex items-center justify-between gap-3 border-b border-vault-700 bg-vault-950 px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-vault-500">Verlauf</p>
                <h2 className="mt-2 text-base font-bold">Letzte Report-Läufe</h2>
              </div>
              <FileText className="h-5 w-5 text-vault-500" aria-hidden="true" />
            </div>
            <div className="p-5">
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="relative border-l-2 border-vault-700 py-1 pl-4 text-sm">
                  <span className={`absolute -left-[5px] top-2 h-2 w-2 rounded-full ${run.status === 'sent' ? 'bg-emerald-500' : run.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden="true" />
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{run.status === 'sent' ? 'Gesendet' : run.status === 'failed' ? 'Fehlgeschlagen' : run.status === 'running' ? 'Läuft' : 'Eingeplant'}</span>
                    <span className="font-mono text-xs text-vault-500">{formatRelativeTime(run.created_at)}</span>
                  </div>
                  {(run.delivery_error || run.error) && (
                    <p className="mt-2 text-xs text-red-700">{run.delivery_error ?? run.error}</p>
                  )}
                </div>
              ))}
              {!runs.length && <p className="text-sm text-vault-400">Noch kein Report versendet.</p>}
            </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
