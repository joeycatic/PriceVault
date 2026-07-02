import { CategoryPage } from '../CategoryPage'

import { currentTenant } from '@/lib/backend'

export default async function GeneralSettingsPage() {
  const tenant = await currentTenant()
  return (
    <CategoryPage
      eyebrow="Einstellungen / Allgemein"
      title="Allgemein"
      description="Basisvorgaben für Sprache, Zeitzone, Währung und Scrape-Frequenz."
      items={[
        { label: 'Zeitzone', value: tenant?.timezone ?? 'Europe/Berlin' },
        { label: 'Sprache', value: tenant?.locale ?? 'de-DE' },
        { label: 'Währung', value: tenant?.default_currency ?? 'EUR' },
        { label: 'Scrape-Frequenz', value: `${tenant?.default_scrape_freq_h ?? 12}h` },
      ]}
      links={[
        { href: '/dashboard/settings', label: 'Einstellungsübersicht' },
        { href: '/dashboard/scrapes', label: 'Scrape-Jobs' },
      ]}
    />
  )
}
