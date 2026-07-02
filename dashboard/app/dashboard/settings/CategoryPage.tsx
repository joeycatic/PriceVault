import Link from 'next/link'

import { currentTenant } from '@/lib/backend'

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
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">{description}</p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="border border-vault-700 bg-vault-900/70 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-vault-500">{item.label}</p>
            <p className="mt-2 truncate font-mono text-xl font-bold">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">Verknuepfte Bereiche</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="border border-vault-800 bg-vault-950 px-4 py-3 text-sm font-semibold text-vault-100 transition hover:border-vault-lime/40 hover:bg-vault-800"
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
