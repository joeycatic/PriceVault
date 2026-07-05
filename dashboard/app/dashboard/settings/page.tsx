import { Bell, Building2, CreditCard, Database, Plug, Settings2, Shield, Users } from 'lucide-react'

import { FeatureLinkCard, MetricGrid, PageHeader } from '@/components/ui/MerchantUI'
import { currentTenant } from '@/lib/backend'

export default async function SettingsPage() {
  const tenant = await currentTenant()
  const sections = [
    { title: 'Allgemein', copy: 'Zeitzone, Sprache, Währung und Standard-Scrape-Frequenz', href: '/dashboard/settings/general', icon: Settings2 },
    { title: 'Unternehmen', copy: 'Shop, Rechnungsdaten, USt-ID und Unternehmensprofil', href: '/dashboard/settings/company', icon: Building2 },
    { title: 'Abrechnung', copy: 'Plan, Viva-Abrechnung, Rechnungsmail und Status', href: '/dashboard/settings/billing', icon: CreditCard },
    { title: 'Benachrichtigungen', copy: 'E-Mail, Slack, Webhooks und Alert-Vorgaben', href: '/dashboard/settings/notifications', icon: Bell },
    { title: 'Sicherheit & API', copy: 'API-Keys, Zugriff und Integrationsoberfläche', href: '/dashboard/settings/security', icon: Shield },
    { title: 'Integrationen', copy: 'Shopify, WooCommerce, CSV und Google Merchant Feeds', href: '/dashboard/settings/integrations', icon: Plug },
    { title: 'Team', copy: 'Rollen, Einladungen, Owner und Sitzlimits', href: '/dashboard/settings/team', icon: Users },
    { title: 'Daten & Datenschutz', copy: 'Export, Löschanfrage und DSGVO-Kontakt', href: '/dashboard/settings/data-privacy', icon: Database },
  ]

  return (
    <>
      <PageHeader eyebrow="Mandant" title="Einstellungen" description={<>Zentrale Konfiguration für {tenant?.shop_name ?? 'deinen Mandanten'}.</>} />

      <div className="mb-6"><MetricGrid items={[
        { label: 'Plan', value: tenant?.plan ?? '-' },
        { label: 'Zeitzone', value: tenant?.timezone ?? 'Europe/Berlin' },
        { label: 'Sprache', value: tenant?.locale ?? 'de-DE' },
        { label: 'Währung', value: tenant?.default_currency ?? 'EUR' },
      ]} /></div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map(({ title, copy, href, icon: Icon }) => (
          <FeatureLinkCard key={title} href={href} icon={Icon} title={title} description={copy} />
        ))}
      </div>
    </>
  )
}
