import Link from 'next/link'
import { revalidatePath } from 'next/cache'

import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
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
      <PageHeader
        eyebrow="Reports / Automation"
        title="Report-Zentrale"
        description={<>Preisabweichungen, Export-Bereitschaft und geplante PDF/CSV-Reports für {tenant?.shop_name ?? 'deinen Shop'}.</>}
      />

      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Quellen', value: latest.length },
          { label: 'Unterboten', value: undercut.length, tone: undercut.length ? 'warning' : 'success' },
          { label: 'Nicht verfügbar', value: unavailable.length, tone: unavailable.length ? 'danger' : 'success' },
          { label: 'Volatil ≥ 10 %', value: volatile.length, tone: volatile.length ? 'warning' : 'neutral' },
        ]} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
        <section className="panel overflow-hidden" aria-labelledby="report-table">
          <div className="border-b border-vault-700 px-5 py-4">
            <h2 id="report-table" className="text-base font-semibold">Aktuelle Report-Zeilen</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-vault-700 text-[10px] uppercase text-vault-500">
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
                  <tr key={row.competitor_product_id}>
                    <td className="px-5 py-4 font-medium">{row.product_name}</td>
                    <td className="px-5 py-4 text-vault-300">{row.competitor_shop}</td>
                    <td className="px-5 py-4 font-mono">{row.competitor_price ?? '-'}</td>
                    <td className="px-5 py-4 font-mono">{row.delta_pct ?? '-'}%</td>
                    <td className="px-5 py-4">
                      <Link className="text-merchant-success hover:underline" href={`/api/export/csv?competitor_product_id=${row.competitor_product_id}`}>
                        CSV
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
          <section className="panel p-5">
            <h2 className="text-base font-semibold">Geplante Reports</h2>
            {canManageReports ? (
              <ReportScheduleForm action={createSchedule} />
            ) : (
              <p className="mt-4 text-sm text-vault-400">Geplante Reports können Owner und Admins ab dem Pro-Plan verwalten.</p>
            )}
            <div className="mt-4 space-y-3">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-lg border border-vault-800 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{schedule.name}</p>
                      <p className="mt-1 text-xs text-vault-400">
                        {schedule.cadence === 'weekly' ? 'Wöchentlich' : 'Monatlich'} · {schedule.include_csv ? 'E-Mail + CSV' : 'E-Mail'}
                      </p>
                      <p className="mt-1 text-xs text-vault-500">
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
          </section>

          <section className="panel p-5">
            <h2 className="text-base font-semibold">Letzte Report-Läufe</h2>
            <div className="mt-4 space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="border border-vault-800 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>{run.status === 'sent' ? 'Gesendet' : run.status === 'failed' ? 'Fehlgeschlagen' : run.status === 'running' ? 'Läuft' : 'Eingeplant'}</span>
                    <span className="font-mono text-xs text-vault-500">{formatRelativeTime(run.created_at)}</span>
                  </div>
                  {(run.delivery_error || run.error) && (
                    <p className="mt-2 text-xs text-red-700">{run.delivery_error ?? run.error}</p>
                  )}
                </div>
              ))}
              {!runs.length && <p className="text-sm text-vault-400">Noch kein Report versendet.</p>}
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
