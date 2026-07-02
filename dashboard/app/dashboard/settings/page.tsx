import Link from 'next/link'

import { currentTenant } from '@/lib/backend'

export default async function SettingsPage() {
  const tenant = await currentTenant()
  const sections = [
    ['General', 'Zeitzone, Sprache, Waehrung und Standard-Scrape-Frequenz', '/dashboard/settings/general'],
    ['Company', 'Shop, Rechnungsdaten, USt-ID und Unternehmensprofil', '/dashboard/settings/company'],
    ['Billing', 'Plan, Viva-Abrechnung, Rechnungsmail und Status', '/dashboard/settings/billing'],
    ['Notifications', 'E-Mail, Slack, Webhooks und Alert-Vorgaben', '/dashboard/settings/notifications'],
    ['Security/API', 'API-Keys, Zugriff und Integrationsoberflaeche', '/dashboard/settings/security'],
    ['Integrations', 'Shopify, WooCommerce, CSV und Google Merchant Feeds', '/dashboard/settings/integrations'],
    ['Team', 'Rollen, Einladungen, Owner und Sitzlimits', '/dashboard/settings/team'],
    ['Data & Privacy', 'Export, Loeschanfrage und DSGVO-Kontakt', '/dashboard/settings/data-privacy'],
  ]

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Settings / Tenant</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Einstellungen</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Zentrale Launch-Konfiguration fuer {tenant?.shop_name ?? 'deinen Mandanten'}.
        </p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Plan', tenant?.plan ?? '-'],
          ['Zeitzone', tenant?.timezone ?? 'Europe/Berlin'],
          ['Locale', tenant?.locale ?? 'de-DE'],
          ['Waehrung', tenant?.default_currency ?? 'EUR'],
        ].map(([label, value]) => (
          <div key={label} className="border border-vault-700 bg-vault-900/70 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-vault-500">{label}</p>
            <p className="mt-2 truncate font-mono text-xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map(([title, copy, href]) => (
          <Link key={title} href={href} className="panel block min-h-40 p-5 transition hover:border-vault-lime/40 hover:bg-vault-800/80">
            <p className="text-[10px] uppercase tracking-[0.14em] text-vault-500">Settings</p>
            <h2 className="mt-3 text-lg font-semibold">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-vault-300">{copy}</p>
          </Link>
        ))}
      </div>
    </>
  )
}
