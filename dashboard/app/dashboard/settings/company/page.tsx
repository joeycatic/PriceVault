import { CategoryPage } from '../CategoryPage'

import { currentTenant } from '@/lib/backend'

export default async function CompanySettingsPage() {
  const tenant = await currentTenant()
  return (
    <CategoryPage
      eyebrow="Einstellungen / Unternehmen"
      title="Unternehmen"
      description="Unternehmensprofil, Shop-Daten und Rechnungsinformationen."
      items={[
        { label: 'Shop', value: tenant?.shop_name ?? '-' },
        { label: 'URL', value: tenant?.shop_url ?? '-' },
        { label: 'Rechnungs-E-Mail', value: tenant?.invoice_email ?? '-' },
        { label: 'USt-IdNr.', value: tenant?.vat_id ?? '-' },
      ]}
      links={[
        { href: '/dashboard/company', label: 'Unternehmen bearbeiten' },
        { href: '/dashboard/settings/billing', label: 'Abrechnung' },
      ]}
    />
  )
}
