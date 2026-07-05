import Link from 'next/link'
import { ArrowRight, BarChart3, Cable, DatabaseZap, FileSpreadsheet, RefreshCw, ShoppingBag, Store } from 'lucide-react'

import {
  HeroStat,
  IntegrationBadge,
  IntegrationHero,
  IntegrationIcon,
  IntegrationLinkCard,
  IntegrationSectionHeading,
} from '@/components/integrations/IntegrationUI'
import { currentTenant } from '@/lib/backend'

const flowSteps = [
  {
    title: 'Shop anbinden',
    description: 'Produkte und Preise sicher aus deinem Commerce-System übernehmen.',
    icon: ShoppingBag,
    tone: 'green' as const,
  },
  {
    title: 'Daten abgleichen',
    description: 'PriceVault ordnet Varianten zu und hält den Produktbestand aktuell.',
    icon: RefreshCw,
    tone: 'violet' as const,
  },
  {
    title: 'Signale verteilen',
    description: 'Reports und Exporte bringen Preisbewegungen direkt ins Team.',
    icon: BarChart3,
    tone: 'blue' as const,
  },
]

export default async function IntegrationSettingsPage() {
  const tenant = await currentTenant()

  return (
    <>
      <IntegrationHero
        eyebrow="Einstellungen / Integrationen"
        title="Dein Datenfluss, an einem Ort."
        description="Verbinde Shops und Feeds mit PriceVault. Jede Quelle bekommt einen klaren Weg vom Import bis zum fertigen Report."
        icon={Cable}
      >
        <HeroStat label="Shop-Systeme" value="2" tone="green" />
        <HeroStat label="Feed-Typen" value="2" tone="amber" />
        <HeroStat label="Sync" value="Automatisch" tone="violet" />
        <HeroStat label="Mandant" value={tenant?.shop_name ?? 'Nicht geladen'} tone="blue" />
      </IntegrationHero>

      <section className="animate-reveal" aria-labelledby="integration-catalog">
        <IntegrationSectionHeading
          eyebrow="Connector-Katalog"
          title="Womit möchtest du PriceVault verbinden?"
          description="Direkte Shop-Anbindungen und flexible Feed-Quellen teilen sich denselben überwachten Sync-Prozess."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <IntegrationLinkCard
            href="/dashboard/settings/connectors#shopify"
            icon={ShoppingBag}
            tone="green"
            eyebrow="Direktimport"
            title="Shopify"
            description="Produkte und Varianten per Admin API in deinen PriceVault-Katalog holen."
            meta="OAuth / Admin API"
          />
          <IntegrationLinkCard
            href="/dashboard/settings/connectors#woocommerce"
            icon={Store}
            tone="violet"
            eyebrow="Shop API"
            title="WooCommerce"
            description="Deinen WooCommerce-Shop mit Consumer Keys verbinden und synchron halten."
            meta="REST API"
          />
          <IntegrationLinkCard
            href="/dashboard/settings/connectors#feeds"
            icon={FileSpreadsheet}
            tone="amber"
            eyebrow="Flexible Quelle"
            title="Produkt-Feeds"
            description="CSV- und Google-Merchant-Feeds als wiederkehrende Katalogquelle einrichten."
            meta="CSV / Merchant"
          />
          <IntegrationLinkCard
            href="/dashboard/reports"
            icon={BarChart3}
            tone="blue"
            eyebrow="Ausgabe"
            title="Reports"
            description="Synchronisierte Preisdaten als geplante Reports und CSV-Exporte verteilen."
            meta="PDF / CSV / E-Mail"
          />
        </div>
      </section>

      <section className="mt-8 overflow-hidden rounded-3xl border border-vault-700 bg-white shadow-panel" aria-labelledby="data-flow-title">
        <div className="grid lg:grid-cols-[0.78fr_1.22fr]">
          <div className="relative overflow-hidden bg-vault-100 p-6 text-white sm:p-8">
            <div className="absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden="true" />
            <IntegrationBadge tone="green">Live-Datenfluss</IntegrationBadge>
            <h2 id="data-flow-title" className="relative mt-5 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Vom Shop bis zur Entscheidung.</h2>
            <p className="relative mt-3 max-w-md text-sm leading-6 text-white/60">
              Die Integration ist kein isolierter Import. Sie verbindet Sortiment, Preisbeobachtung und Team-Reporting zu einem nachvollziehbaren Ablauf.
            </p>
            <div className="relative mt-8 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]" aria-hidden="true" />
              Bereit für den nächsten Sync
            </div>
          </div>

          <div className="grid gap-0 p-5 sm:p-7 lg:grid-cols-3 lg:p-8">
            {flowSteps.map((step, index) => (
              <div key={step.title} className="relative flex gap-4 border-b border-vault-800 py-5 first:pt-0 last:border-b-0 last:pb-0 lg:block lg:border-b-0 lg:border-r lg:px-6 lg:py-0 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
                <IntegrationIcon icon={step.icon} tone={step.tone} className="h-10 w-10 rounded-xl" />
                <div className="min-w-0 lg:mt-6">
                  <p className="font-mono text-[10px] font-bold text-vault-500">0{index + 1}</p>
                  <h3 className="mt-1 font-bold text-vault-100">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-vault-500">{step.description}</p>
                </div>
                {index < flowSteps.length - 1 ? (
                  <ArrowRight className="absolute -right-2 top-3 hidden h-4 w-4 translate-x-1/2 bg-white text-vault-500 lg:block" aria-hidden="true" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 flex flex-col justify-between gap-4 rounded-3xl border border-sky-200 bg-sky-50 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex items-start gap-4">
          <IntegrationIcon icon={DatabaseZap} tone="blue" className="h-10 w-10 rounded-xl" />
          <div>
            <h2 className="font-bold text-sky-950">Connector-Status im Blick behalten</h2>
            <p className="mt-1 text-sm leading-6 text-sky-900/70">In der Connector-Verwaltung siehst du Importmengen, letzte Läufe und mögliche Fehler pro Quelle.</p>
          </div>
        </div>
        <Link href="/dashboard/settings/connectors" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white transition hover:bg-sky-900">
          Connectoren öffnen
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </>
  )
}
