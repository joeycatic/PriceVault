import { CategoryPage } from '../CategoryPage'

import { currentTenant } from '@/lib/backend'

export default async function CompanySettingsPage() {
  const tenant = await currentTenant()
  return (
    <CategoryPage
      eyebrow="Settings / Company"
      title="Company"
      description="Unternehmensprofil, Shop-Daten und Rechnungsinformationen."
      items={[
        { label: 'Shop', value: tenant?.shop_name ?? '-' },
        { label: 'URL', value: tenant?.shop_url ?? '-' },
        { label: 'Invoice', value: tenant?.invoice_email ?? '-' },
        { label: 'VAT ID', value: tenant?.vat_id ?? '-' },
      ]}
      links={[
        { href: '/dashboard/company', label: 'Unternehmen bearbeiten' },
        { href: '/dashboard/settings/billing', label: 'Abrechnung' },
      ]}
    />
  )
}
