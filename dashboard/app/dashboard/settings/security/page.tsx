import { CategoryPage } from '../CategoryPage'

import { currentTenant } from '@/lib/backend'

export default async function SecuritySettingsPage() {
  const tenant = await currentTenant()
  return (
    <CategoryPage
      eyebrow="Settings / Security"
      title="Security/API"
      description="API-Zugriff, Rollen und sichere Integrationsoberflaechen."
      items={[
        { label: 'Rolle', value: tenant?.membership_role ?? 'owner' },
        { label: 'API', value: tenant?.plan === 'free' ? 'Pro erforderlich' : 'verfuegbar' },
        { label: 'Audit', value: 'aktiv' },
        { label: 'Secrets', value: 'verdeckt' },
      ]}
      links={[
        { href: '/dashboard/settings/api-keys', label: 'API-Keys' },
        { href: '/dashboard/settings/team', label: 'Team-Rollen' },
      ]}
    />
  )
}
