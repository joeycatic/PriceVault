import { CategoryPage } from '../CategoryPage'

import { currentTenant } from '@/lib/backend'

export default async function GeneralSettingsPage() {
  const tenant = await currentTenant()
  return (
    <CategoryPage
      eyebrow="Settings / General"
      title="General"
      description="Basisvorgaben für Sprache, Zeitzone, Währung und Scrape-Frequenz."
      items={[
        { label: 'Zeitzone', value: tenant?.timezone ?? 'Europe/Berlin' },
        { label: 'Locale', value: tenant?.locale ?? 'de-DE' },
        { label: 'Waehrung', value: tenant?.default_currency ?? 'EUR' },
        { label: 'Scrape-Frequenz', value: `${tenant?.default_scrape_freq_h ?? 12}h` },
      ]}
      links={[
        { href: '/dashboard/settings', label: 'Settings-Uebersicht' },
        { href: '/dashboard/scrapes', label: 'Scrape-Jobs' },
      ]}
    />
  )
}
