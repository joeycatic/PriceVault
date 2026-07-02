import { ArrowRight, BarChart3, BellRing, Check, FileText, Link2, RefreshCw, ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { PublicFooter, PublicHeader } from '@/components/ui/PublicChrome'
import { currentTenant } from '@/lib/backend'

export const metadata: Metadata = {
  title: 'PriceVault – Wettbewerberpreise automatisch überwachen',
  description: 'PriceVault überwacht Wettbewerberpreise, Verfügbarkeit und Marktbewegungen für DACH E-Commerce-Teams.',
}

const benefits = [
  { icon: RefreshCw, title: 'Preise automatisch abrufen', copy: 'Überwache Produktseiten nach deinem Zeitplan und erkenne fehlgeschlagene Quellen frühzeitig.' },
  { icon: BellRing, title: 'Nur relevante Signale', copy: 'Lass dich bei Unterbietungen, Preisbewegungen und Verfügbarkeitsänderungen gezielt informieren.' },
  { icon: FileText, title: 'Reports ohne Handarbeit', copy: 'Exportiere CSV- und PDF-Berichte oder versende geplante Auswertungen an dein Team.' },
]

const plans = [
  { name: 'Free', price: '0 €', description: 'Für den ersten Marktüberblick.', features: ['5 Produkte', '50 Preisabrufe pro Tag', '3 Preisalarme'], featured: false },
  { name: 'Pro', price: '29 €', description: 'Für aktive E-Commerce-Teams.', features: ['50 Produkte', '500 Preisabrufe pro Tag', 'Integrationen und API'], featured: true },
  { name: 'Agency', price: '99 €', description: 'Für Portfolios und Kundenprojekte.', features: ['Unbegrenzte Produkte', '5.000 Preisabrufe pro Tag', 'Bis zu 5 Teammitglieder'], featured: false },
]

export default async function HomePage() {
  const tenant = await currentTenant()
  const primaryHref = tenant ? '/dashboard' : '/signup'

  return (
    <div className="min-h-screen bg-white text-vault-100">
      <PublicHeader dashboardAvailable={Boolean(tenant)} />

      <main>
        <section className="relative min-h-[620px] overflow-hidden border-b border-vault-700 sm:min-h-[680px]" aria-labelledby="hero-heading">
          <Image src="/images/pricevault-dashboard.webp" alt="PriceVault Preisüberwachung mit Produktstatus und Marktpreisen" fill priority className="object-cover object-top" sizes="100vw" />
          <div className="absolute inset-0 bg-white/80" />
          <div className="relative mx-auto flex min-h-[620px] max-w-[1280px] items-center px-5 pb-24 pt-16 sm:min-h-[680px] sm:px-8">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-vault-700 bg-white/90 px-3 py-1.5 text-xs font-semibold text-vault-300 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-merchant-success" />
                Preisintelligenz für DACH E-Commerce
              </p>
              <h1 id="hero-heading" className="mt-6 text-4xl font-bold leading-[1.05] sm:text-6xl">
                Wettbewerberpreise automatisch im Blick.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-vault-300 sm:text-lg">
                PriceVault überwacht Preise und Verfügbarkeit, priorisiert Abweichungen und liefert deinem Team belastbare Reports für schnelle Entscheidungen.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={primaryHref} className="button-primary gap-2 px-5">
                  {tenant ? 'Dashboard öffnen' : 'Kostenlos starten'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="#produkt" className="button-secondary px-5">Produkt ansehen</Link>
              </div>
              <p className="mt-4 text-xs text-vault-500">Ohne Kreditkarte · Free-Plan verfügbar · DSGVO-orientiert</p>
            </div>
          </div>
        </section>

        <section id="produkt" className="border-b border-vault-700 bg-vault-950 py-16 sm:py-20">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold text-vault-500">Ein Arbeitsbereich statt Tabellenchaos</p>
                <h2 className="mt-3 text-3xl font-bold">Die Marktposition wird zur täglichen Arbeitsliste.</h2>
                <p className="mt-4 text-sm leading-7 text-vault-300">Sortiere nach Handlungsbedarf, prüfe Quellenzustände und öffne kritische Produkte direkt aus einer kompakten Händleransicht.</p>
                <ul className="mt-6 space-y-3 text-sm text-vault-300">
                  {['Eigene Preise und Marktpreise nebeneinander', 'Kritische Abweichungen klar priorisiert', 'Verfügbarkeit und Scrape-Status nachvollziehbar'].map((item) => (
                    <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-merchant-success" aria-hidden="true" />{item}</li>
                  ))}
                </ul>
              </div>
              <div className="overflow-hidden rounded-lg border border-vault-700 bg-white shadow-[0_18px_50px_rgba(26,26,26,.12)]">
                <Image src="/images/pricevault-dashboard.webp" alt="PriceVault Produktübersicht" width={1440} height={1000} className="h-auto w-full" sizes="(min-width: 1024px) 680px, 100vw" />
              </div>
            </div>
          </div>
        </section>

        <section id="funktionen" className="border-b border-vault-700 py-16 sm:py-20">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="max-w-2xl"><p className="text-sm font-semibold text-vault-500">Von der Quelle bis zum Report</p><h2 className="mt-3 text-3xl font-bold">Alles für wiederholbare Preisbeobachtung.</h2></div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {benefits.map(({ icon: Icon, title, copy }) => (
                <article key={title} className="rounded-lg border border-vault-700 bg-white p-6 shadow-panel">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-vault-800"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <h3 className="mt-5 text-base font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-vault-500">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-vault-700 bg-[#303030] py-16 text-white sm:py-20">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
              <div><p className="text-sm font-semibold text-white/55">Ein klarer Ablauf</p><h2 className="mt-3 text-3xl font-bold">In drei Schritten zum Marktüberblick.</h2></div>
              <ol className="grid gap-px overflow-hidden rounded-lg bg-white/15 sm:grid-cols-3">
                {[
                  ['01', 'Sortiment verbinden', 'Produkte importieren oder über Shopify, WooCommerce und Feeds synchronisieren.'],
                  ['02', 'Quellen überwachen', 'Mitbewerber-URLs verbinden und automatische Preisabrufe planen.'],
                  ['03', 'Entscheidungen treffen', 'Abweichungen priorisieren, Alarme auslösen und Reports teilen.'],
                ].map(([number, title, copy]) => (
                  <li key={number} className="bg-[#303030] p-6"><span className="text-xs text-white/45">{number}</span><h3 className="mt-7 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-white/55">{copy}</p></li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="integrationen" className="border-b border-vault-700 py-16 sm:py-20">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
              <div><p className="text-sm font-semibold text-vault-500">Integrationen</p><h2 className="mt-3 text-3xl font-bold">Dein Sortiment bleibt die Quelle der Wahrheit.</h2><p className="mt-4 text-sm leading-7 text-vault-300">Verbinde bestehende Systeme, ordne SKUs und Währungen zu und behalte Synchronisationsläufe im Blick.</p></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {['Shopify', 'WooCommerce', 'CSV-Feed', 'Google Merchant', 'REST API', 'Webhooks'].map((name) => <div key={name} className="flex min-h-24 items-center justify-center rounded-lg border border-vault-700 bg-vault-950 px-4 text-center text-sm font-semibold"><Link2 className="mr-2 h-4 w-4 text-vault-500" aria-hidden="true" />{name}</div>)}
              </div>
            </div>
          </div>
        </section>

        <section id="preise" className="border-b border-vault-700 bg-vault-950 py-16 sm:py-20">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="text-center"><p className="text-sm font-semibold text-vault-500">Transparente Tarife</p><h2 className="mt-3 text-3xl font-bold">Starte kostenlos. Skaliere nach Bedarf.</h2></div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {plans.map((plan) => (
                <article key={plan.name} className={`rounded-lg border bg-white p-6 ${plan.featured ? 'border-vault-100 shadow-[0_8px_28px_rgba(26,26,26,.12)]' : 'border-vault-700 shadow-panel'}`}>
                  <div className="flex items-center justify-between"><h3 className="font-semibold">{plan.name}</h3>{plan.featured && <span className="rounded-full bg-vault-100 px-2.5 py-1 text-[10px] font-semibold text-white">Empfohlen</span>}</div>
                  <p className="mt-5 text-3xl font-bold">{plan.price}<span className="text-sm font-normal text-vault-500"> / Monat</span></p>
                  <p className="mt-2 text-sm text-vault-500">{plan.description}</p>
                  <ul className="mt-6 space-y-3 text-sm text-vault-300">{plan.features.map((feature) => <li key={feature} className="flex gap-3"><Check className="h-4 w-4 text-merchant-success" aria-hidden="true" />{feature}</li>)}</ul>
                  <Link href={primaryHref} className={plan.featured ? 'button-primary mt-7 w-full' : 'button-secondary mt-7 w-full'}>{tenant ? 'Dashboard öffnen' : 'Plan starten'}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="border-b border-vault-700 py-16 sm:py-20">
          <div className="mx-auto grid max-w-[980px] gap-10 px-5 sm:px-8 lg:grid-cols-[0.55fr_1fr]">
            <div><p className="text-sm font-semibold text-vault-500">FAQ</p><h2 className="mt-3 text-3xl font-bold">Häufige Fragen.</h2></div>
            <div className="divide-y divide-vault-700 border-y border-vault-700">
              {[
                ['Wie werden Preise erfasst?', 'PriceVault ruft verbundene Produktseiten über einen Browser-Worker ab und speichert Preis, Verfügbarkeit und Zeitpunkt.'],
                ['Kann ich mit wenigen Produkten starten?', 'Ja. Der Free-Plan umfasst bis zu fünf Produkte und 50 Preisabrufe pro Tag.'],
                ['Welche Shopsysteme werden unterstützt?', 'Für den Launch sind Shopify, WooCommerce, CSV- und Google-Merchant-Feeds sowie die REST API vorgesehen.'],
                ['Sind Teamzugänge möglich?', 'Der Agency-Plan unterstützt mehrere Rollen und bis zu fünf Teammitglieder.'],
              ].map(([question, answer]) => <details key={question} className="group py-5"><summary className="cursor-pointer list-none font-semibold">{question}<span className="float-right text-vault-500 group-open:rotate-45">+</span></summary><p className="mt-3 pr-8 text-sm leading-6 text-vault-500">{answer}</p></details>)}
            </div>
          </div>
        </section>

        <section className="bg-vault-950 py-16 sm:py-20">
          <div className="mx-auto max-w-[900px] px-5 text-center sm:px-8"><ShieldCheck className="mx-auto h-7 w-7 text-merchant-success" aria-hidden="true" /><h2 className="mt-5 text-3xl font-bold">Dein Marktüberblick beginnt mit einem Produkt.</h2><p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-vault-500">Lege kostenlos deinen Shop, ein Produkt und die erste Preisquelle an.</p><Link href={primaryHref} className="button-primary mt-7 gap-2 px-5">{tenant ? 'Dashboard öffnen' : 'Kostenlos starten'} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
        </section>
      </main>

      <PublicFooter />
    </div>
  )
}
