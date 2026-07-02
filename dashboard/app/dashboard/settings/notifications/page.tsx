import { CategoryPage } from '../CategoryPage'

export default function NotificationSettingsPage() {
  return (
    <CategoryPage
      eyebrow="Settings / Notifications"
      title="Notifications"
      description="Alert-Kanäle und Standardvorgaben für Preisalarme."
      items={[
        { label: 'E-Mail', value: 'aktivierbar' },
        { label: 'Slack', value: 'Pro' },
        { label: 'Webhook', value: 'Pro' },
        { label: 'Cooldown', value: 'pro Alert' },
      ]}
      links={[
        { href: '/dashboard/alerts', label: 'Preisalarme' },
        { href: '/dashboard/alerts/channels', label: 'Kanaele verwalten' },
      ]}
    />
  )
}
