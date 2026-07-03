import Link from 'next/link'

import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import type { CompetitorProduct } from '@/lib/types'
import { formatRelativeTime } from '@/lib/utils'

type SourceRow = CompetitorProduct & {
  products: { name: string } | null
  product_variants: { name: string } | null
  competitors: { shop_name: string; scrape_freq_h: number } | null
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
  const healthy = sources.filter((source) => source.health_status === 'healthy').length
  const degraded = sources.filter((source) => source.health_status === 'degraded').length
  const broken = sources.filter((source) => source.health_status === 'broken').length
  const availability = sources.length ? healthy / sources.length * 100 : 0

  return (
    <>
      <PageHeader eyebrow="Betrieb" title="Quellenstatus" description="Erreichbarkeit, Fehlerfolgen und letzter erfolgreicher Preisabruf je Quelle." />
      <div className="mb-6">
        <MetricGrid items={[
          { label: 'Verfügbarkeit', value: `${availability.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`, detail: `${healthy} von ${sources.length} gesund`, tone: broken ? 'danger' : degraded ? 'warning' : 'success' },
          { label: 'Gesund', value: healthy, detail: 'Liefert verwertbare Preise', tone: 'success' },
          { label: 'Degradiert', value: degraded, detail: 'Vorübergehende Fehler', tone: degraded ? 'warning' : 'success' },
          { label: 'Defekt', value: broken, detail: 'Manuelle Prüfung nötig', tone: broken ? 'danger' : 'success' },
        ]} />
      </div>
      <section className="panel overflow-hidden" aria-labelledby="source-list">
        <div className="border-b border-vault-700 px-5 py-4"><h2 id="source-list" className="font-semibold">Alle Preisquellen</h2></div>
        <div className="divide-y divide-vault-700/70">
          {sources.map((source) => (
            <article key={source.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_160px_180px_auto] md:items-center">
              <div><Link className="font-semibold hover:text-merchant-success" href={`/dashboard/products/${source.product_id}`}>{source.products?.name} · {source.product_variants?.name}</Link><p className="mt-1 text-xs text-vault-500">{source.competitors?.shop_name}</p></div>
              <div><p className="text-xs text-vault-500">Fehler in Folge</p><p className="mt-1 font-mono font-semibold">{source.consecutive_failures}</p></div>
              <div><p className="text-xs text-vault-500">Letzter Erfolg</p><p className="mt-1 text-sm">{formatRelativeTime(source.last_successful_scrape_at)}</p></div>
              <span className={`text-xs font-semibold ${source.health_status === 'broken' ? 'text-red-700' : source.health_status === 'degraded' ? 'text-amber-700' : 'text-merchant-success'}`}>{source.health_status === 'broken' ? 'Defekt' : source.health_status === 'degraded' ? 'Degradiert' : 'Gesund'}</span>
            </article>
          ))}
          {!sources.length && <p className="p-6 text-sm text-vault-400">Noch keine aktiven Preisquellen.</p>}
        </div>
      </section>
    </>
  )
}
