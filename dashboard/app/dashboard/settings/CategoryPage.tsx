import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { currentTenant } from '@/lib/backend'
import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'

type SettingItem = {
  label: string
  value: string
}

type RelatedLink = {
  href: string
  label: string
}

export async function CategoryPage({
  title,
  eyebrow,
  description,
  items,
  links,
}: {
  title: string
  eyebrow: string
  description: string
  items: SettingItem[]
  links: RelatedLink[]
}) {
  const tenant = await currentTenant()

  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <div className="mb-6"><MetricGrid items={items.map((item) => ({ label: item.label, value: item.value }))} /></div>

      <section className="panel overflow-hidden">
        <div className="border-b border-vault-700 bg-white px-5 py-4">
          <p className="eyebrow">Kontext</p>
          <h2 className="mt-2 text-xl font-semibold">Verknüpfte Bereiche</h2>
        </div>
        <div className="p-5">
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex min-h-20 items-center justify-between gap-3 rounded-xl border border-vault-700 bg-vault-950 px-4 py-3 text-sm font-semibold text-vault-100 transition hover:border-vault-500 hover:bg-white hover:shadow-sm"
            >
              <span>{link.label}</span>
              <ArrowRight className="h-4 w-4 text-vault-500 transition group-hover:translate-x-0.5 group-hover:text-vault-100" aria-hidden="true" />
            </Link>
          ))}
        </div>
        <p className="mt-5 text-xs text-vault-500">
          Aktiver Mandant: {tenant?.shop_name ?? 'nicht geladen'}
        </p>
        </div>
      </section>
    </>
  )
}
