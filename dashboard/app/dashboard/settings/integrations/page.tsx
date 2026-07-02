import { CategoryPage } from '../CategoryPage'

export default function IntegrationSettingsPage() {
  return (
    <CategoryPage
      eyebrow="Settings / Integrations"
      title="Integrations"
      description="Shopify, WooCommerce, Feed-Quellen und Connector-Syncs."
      items={[
        { label: 'Shopify', value: 'OAuth' },
        { label: 'WooCommerce', value: 'REST' },
        { label: 'Feeds', value: 'CSV / Merchant' },
        { label: 'Syncs', value: 'Historie' },
      ]}
      links={[
        { href: '/dashboard/settings/connectors', label: 'Connectoren verwalten' },
        { href: '/dashboard/reports', label: 'Reports' },
      ]}
    />
  )
}
