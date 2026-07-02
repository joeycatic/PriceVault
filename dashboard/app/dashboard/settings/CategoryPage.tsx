import Link from 'next/link'

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

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Verknüpfte Bereiche</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-vault-700 bg-white px-4 py-3 text-sm font-semibold text-vault-100 transition hover:bg-vault-800"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <p className="mt-5 text-xs text-vault-500">
          Aktiver Mandant: {tenant?.shop_name ?? 'nicht geladen'}
        </p>
      </section>
    </>
  )
}
