import Link from 'next/link'

import { BenchmarkBar } from '@/components/ui/BenchmarkBar'
import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { backendFetch, currentTenant } from '@/lib/backend'
import { hasPlan } from '@/lib/plan-gates'
import { formatPrice } from '@/lib/utils'

type BenchmarkRow = {
  product_id: string
  variant_id: string
  product_name: string
  our_price: number
  lowest: number
  highest: number
  rank: number
  of: number
  delta_to_lowest_pct: number | null
  position: 'cheapest' | 'within_5_pct' | 'mid' | 'most_expensive'
}

type BenchmarkPayload = {
  summary: Record<'cheapest' | 'within_5_pct' | 'mid' | 'most_expensive' | 'no_data', number>
  rows: BenchmarkRow[]
}

const positionLabels: Record<BenchmarkRow['position'], string> = {
  cheapest: 'Günstigster Anbieter',
  within_5_pct: 'Innerhalb 5 %',
  mid: 'Mittelfeld',
  most_expensive: 'Teuerster Anbieter',
}

export default async function BenchmarkPage() {
  const tenant = await currentTenant()
  const enabled = hasPlan(tenant?.plan, 'pro')
  let data: BenchmarkPayload = {
    summary: { cheapest: 0, within_5_pct: 0, mid: 0, most_expensive: 0, no_data: 0 },
    rows: [],
  }

  if (tenant && enabled) {
    const response = await backendFetch('/benchmark', tenant.id)
    if (response.ok) data = await response.json()
  }

  return (
    <>
      <PageHeader
        eyebrow="Marktposition"
        title="Katalog-Benchmark"
        description="Sieh auf einen Blick, wie dein Sortiment gegen die neuesten validen Mitbewerberpreise positioniert ist."
      />

      {!enabled ? (
        <div className="panel border-l-2 border-l-merchant-success p-5 text-sm text-vault-300">
          Der Markt-Benchmark ist ab dem Pro-Plan verfügbar.
        </div>
      ) : (
        <>
          <div className="mb-6">
            <MetricGrid items={[
              { label: 'Günstigster Anbieter', value: data.summary.cheapest, tone: 'success' },
              { label: 'Innerhalb 5 %', value: data.summary.within_5_pct, tone: 'success' },
              { label: 'Mittelfeld', value: data.summary.mid, tone: 'warning' },
              { label: 'Teuerster Anbieter', value: data.summary.most_expensive, tone: data.summary.most_expensive ? 'danger' : 'neutral' },
            ]} />
            <p className="mt-3 text-sm text-vault-500">Ohne Vergleichsdaten: {data.summary.no_data}</p>
          </div>

          <section className="panel overflow-hidden">
            <div className="border-b border-vault-700 px-5 py-4">
              <h2 className="font-semibold">Varianten nach größtem Abstand</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-vault-700 text-sm">
                <thead className="bg-vault-950 text-left text-xs uppercase tracking-[0.08em] text-vault-500">
                  <tr>
                    <th className="px-5 py-3">Produkt</th>
                    <th className="px-5 py-3">Dein Preis</th>
                    <th className="px-5 py-3">Günstigster Mitbewerber</th>
                    <th className="px-5 py-3">Abstand</th>
                    <th className="px-5 py-3">Rang</th>
                    <th className="px-5 py-3">Spanne</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vault-700">
                  {data.rows.map((row) => (
                    <tr key={row.variant_id}>
                      <td className="px-5 py-4">
                        <Link href={`/dashboard/products/${row.product_id}`} className="font-semibold text-vault-100 hover:text-merchant-success">
                          {row.product_name}
                        </Link>
                        <p className="mt-1 text-xs text-vault-500">{positionLabels[row.position]}</p>
                      </td>
                      <td className="px-5 py-4 font-mono">{formatPrice(row.our_price)}</td>
                      <td className="px-5 py-4 font-mono">{formatPrice(row.lowest)}</td>
                      <td className="px-5 py-4 font-mono">{row.delta_to_lowest_pct === null ? '–' : `${row.delta_to_lowest_pct.toLocaleString('de-DE')} %`}</td>
                      <td className="px-5 py-4">{row.rank} von {row.of}</td>
                      <td className="px-5 py-4"><BenchmarkBar lowest={row.lowest} highest={row.highest} ourPrice={row.our_price} /></td>
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan={6} className="px-5 py-6 text-vault-500">Noch keine Benchmark-Daten vorhanden.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  )
}
