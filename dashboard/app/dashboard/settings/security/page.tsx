import { CategoryPage } from '../CategoryPage'

import { currentTenant } from '@/lib/backend'

export default async function SecuritySettingsPage() {
  const tenant = await currentTenant()
  return (
    <CategoryPage
      eyebrow="Einstellungen / Sicherheit"
      title="Sicherheit/API"
      description="API-Zugriff, Rollen und sichere Integrationsoberflächen."
      items={[
        { label: 'Rolle', value: tenant?.membership_role ?? 'owner' },
        { label: 'API', value: tenant?.plan === 'free' ? 'Pro erforderlich' : 'verfügbar' },
        { label: 'Audit', value: 'aktiv' },
        { label: 'Zugangsdaten', value: 'verdeckt' },
      ]}
      links={[
        { href: '/dashboard/settings/api-keys', label: 'API-Keys' },
        { href: '/dashboard/settings/team', label: 'Team-Rollen' },
      ]}
    />
  )
}
