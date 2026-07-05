import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { AlertTriangle, CheckCircle2, Clock3, XCircle } from 'lucide-react'

import { EmptyState, MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import type { CompetitorProduct } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

type SourceRow = CompetitorProduct & {
  products: { name: string } | null
  product_variants: { name: string } | null
  competitors: { shop_name: string; scrape_freq_h: number } | null
}

type Validation = {
  source_id: string
  expected_currency: string | null
  expected_variant: string | null
  validation_state: string
  validation_notes: string | null
  policy: { robots_result: string; robots_checked_at: string | null; approved_host: string; block_reason: string | null } | null
  latest_evidence: { currency: string | null; price_type: string; extraction_method: string; confidence: number; validation_state: string; validation_reason: string | null } | null
}

export default async function SourceHealthPage() {
  const tenant = await currentTenant()
  const supabase = await createClient()
  const { data } = tenant
    ? await supabase
      .from('competitor_products')
      .select('*, products(name), product_variants(name), competitors(shop_name,scrape_freq_h)')
      .eq('tenant_id', tenant.id)
      .eq('active', true)
      .order('health_status')
    : { data: [] }
  const sources = (data ?? []) as SourceRow[]
  const validations = new Map<string, Validation>()
  if (tenant && ['owner', 'admin'].includes(tenant.membership_role ?? 'owner')) {
    await Promise.all(sources.map(async (source) => {
      try {
        const response = await backendFetch(`/sources/${source.id}/validation`, tenant.id)
        if (response.ok) validations.set(source.id, await response.json())
      } catch { /* source details remain unavailable */ }
    }))
  }

  async function validateSource(formData: FormData) {
    'use server'
    if (!tenant) return
    await backendFetch(`/sources/${String(formData.get('source_id'))}/validation`, tenant.id, {
      method: 'PATCH',
      body: JSON.stringify({
        expected_currency: String(formData.get('expected_currency') ?? '').trim().toUpperCase() || null,
        expected_variant: String(formData.get('expected_variant') ?? '').trim() || null,
        validation_state: String(formData.get('validation_state')),
        validation_notes: String(formData.get('validation_notes') ?? '').trim() || null,
      }),
    })
    revalidatePath('/dashboard/source-health')
  }
  const healthy = sources.filter((source) => source.health_status === 'healthy').length
  const degraded = sources.filter((source) => source.health_status === 'degraded').length
  const broken = sources.filter((source) => source.health_status === 'broken').length
  const blocked = sources.filter((source) => source.health_status === 'blocked').length
  const availability = sources.length ? healthy / sources.length * 100 : 0

  return (
    <>
      <PageHeader eyebrow="Betrieb" title="Quellenstatus" description="Erreichbarkeit, Fehlerfolgen und letzter erfolgreicher Preisabruf je Quelle." />
      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Verfügbarkeit', value: `${availability.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`, detail: `${healthy} von ${sources.length} gesund`, tone: broken ? 'danger' : degraded ? 'warning' : 'success' },
          { label: 'Gesund', value: healthy, detail: 'Liefert verwertbare Preise', tone: 'success' },
          { label: 'Degradiert', value: degraded, detail: 'Vorübergehende Fehler', tone: degraded ? 'warning' : 'success' },
          { label: 'Defekt / blockiert', value: broken + blocked, detail: blocked ? `${blocked} durch Abrufrichtlinie blockiert` : 'Manuelle Prüfung nötig', tone: broken + blocked ? 'danger' : 'success' },
        ]} />
      </div>
      <section className="panel overflow-hidden" aria-labelledby="source-list">
        <div className="border-b border-vault-700 bg-white px-5 py-4">
          <p className="eyebrow">Quellenmonitor</p>
          <h2 id="source-list" className="mt-2 text-xl font-semibold">Alle Preisquellen</h2>
        </div>
        {sources.length ? (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {sources.map((source) => (
            <article key={source.id} className="relative overflow-hidden rounded-xl border border-vault-700 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(26,26,26,.10)]">
              <div className={`absolute inset-x-0 top-0 h-1 ${source.health_status === 'blocked' ? 'bg-slate-500' : source.health_status === 'broken' ? 'bg-red-500' : source.health_status === 'degraded' ? 'bg-amber-500' : 'bg-merchant-success'}`} aria-hidden="true" />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link className="truncate font-bold hover:text-merchant-success" href={`/dashboard/products/${source.product_id}`}>
                    {source.products?.name} · {source.product_variants?.name}
                  </Link>
                  <p className="mt-1 text-sm text-vault-500">{source.competitors?.shop_name}</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${source.health_status === 'blocked' ? 'bg-slate-100 text-slate-700' : source.health_status === 'broken' ? 'bg-red-50 text-red-700' : source.health_status === 'degraded' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {source.health_status === 'blocked' || source.health_status === 'broken' ? <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> : source.health_status === 'degraded' ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {source.health_status === 'blocked' ? 'Blockiert' : source.health_status === 'broken' ? 'Defekt' : source.health_status === 'degraded' ? 'Degradiert' : 'Gesund'}
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-vault-950 px-3 py-2">
                  <dt className="text-vault-500">Fehler</dt>
                  <dd className="mt-1 font-mono font-semibold">{source.consecutive_failures}</dd>
                </div>
                <div className="rounded-lg bg-vault-950 px-3 py-2">
                  <dt className="text-vault-500">Intervall</dt>
                  <dd className="mt-1 font-semibold">{source.competitors?.scrape_freq_h ?? '–'} Std.</dd>
                </div>
                <div className="rounded-lg bg-vault-950 px-3 py-2">
                  <dt className="text-vault-500">Erfolg</dt>
                  <dd className="mt-1 truncate font-semibold">{formatRelativeTime(source.last_successful_scrape_at)}</dd>
                </div>
              </dl>
              {source.last_failure_reason && (
                <p className="mt-4 flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {source.last_failure_reason}
                </p>
              )}
              {validations.get(source.id) && (() => {
                const validation = validations.get(source.id)!
                return <div className="mt-4 border-t border-vault-700 pt-4 text-xs">
                  <dl className="grid grid-cols-2 gap-2">
                    <div><dt className="text-vault-500">Erkannte Währung</dt><dd className="mt-1 font-semibold">{validation.latest_evidence?.currency ?? 'unbekannt'}</dd></div>
                    <div><dt className="text-vault-500">Preistyp</dt><dd className="mt-1 font-semibold">{validation.latest_evidence?.price_type ?? 'unbekannt'}</dd></div>
                    <div><dt className="text-vault-500">Extraktion</dt><dd className="mt-1 font-semibold">{validation.latest_evidence?.extraction_method ?? 'unbekannt'}</dd></div>
                    <div><dt className="text-vault-500">Konfidenz</dt><dd className="mt-1 font-semibold">{validation.latest_evidence ? `${Math.round(validation.latest_evidence.confidence * 100)} %` : '–'}</dd></div>
                    <div><dt className="text-vault-500">Robots</dt><dd className="mt-1 font-semibold">{validation.policy?.robots_result ?? 'ungeprüft'}</dd></div>
                    <div><dt className="text-vault-500">Freigegebener Host</dt><dd className="mt-1 truncate font-semibold">{validation.policy?.approved_host ?? '–'}</dd></div>
                  </dl>
                  {(validation.latest_evidence?.validation_reason || validation.policy?.block_reason) && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-amber-900">{validation.policy?.block_reason ?? validation.latest_evidence?.validation_reason}</p>}
                  <form action={validateSource} className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="source_id" value={source.id} />
                    <label><span className="field-label">Erwartete Währung</span><input className="field" name="expected_currency" maxLength={3} defaultValue={validation.expected_currency ?? ''} /></label>
                    <label><span className="field-label">Erwartete Variante</span><input className="field" name="expected_variant" defaultValue={validation.expected_variant ?? ''} /></label>
                    <label className="sm:col-span-2"><span className="field-label">Prüfnotiz</span><input className="field" name="validation_notes" defaultValue={validation.validation_notes ?? ''} /></label>
                    <button className="button-primary" name="validation_state" value="validated">Manuell bestätigen</button>
                    <button className="button-secondary" name="validation_state" value="rejected">Ablehnen</button>
                  </form>
                </div>
              })()}
            </article>
          ))}
        </div>
        ) : (
          <div className="p-6">
            <EmptyState icon={Clock3} title="Noch keine aktiven Preisquellen" description="Lege Produkte und Mitbewerberquellen an, damit der Quellenmonitor Daten anzeigen kann." />
          </div>
        )}
      </section>
    </>
  )
}
