import Link from 'next/link'

const concepts = [
  { href: '/design-lab/hygraph', label: '01 Hygraph' },
  { href: '/design-lab/vercel', label: '02 Vercel' },
  { href: '/design-lab/control-room', label: '03 Control Room' },
  { href: '/design-lab/ledger', label: '04 Market Ledger' },
  { href: '/design-lab/swiss-grid', label: '05 Swiss Grid' },
  { href: '/design-lab/focus-console', label: '06 Focus' },
  { href: '/design-lab/blueprint', label: '07 Blueprint' },
  { href: '/design-lab/commerce-desk', label: '08 Commerce' },
  { href: '/design-lab/soft-console', label: '09 Soft Console' },
  { href: '/design-lab/brutalist-ops', label: '10 Brutalist' },
  { href: '/design-lab/radar', label: '11 Radar' },
  { href: '/design-lab/terminal', label: '12 Terminal' },
  { href: '/design-lab/diff-view', label: '13 Diff View' },
  { href: '/design-lab/trading-desk', label: '14 Trading Desk' },
  { href: '/design-lab/field-notebook', label: '15 Field Notes' },
  { href: '/design-lab/clean-workspace', label: '16 Clean' },
  { href: '/design-lab/linear-workspace', label: '17 Linear' },
  { href: '/design-lab/stripe-analytics', label: '18 Stripe' },
  { href: '/design-lab/merchant-admin', label: '19 Shopify' },
  { href: '/design-lab/notion-database', label: '20 Notion' },
  { href: '/design-lab/retool-ops', label: '21 Retool' },
  { href: '/design-lab/attio-data', label: '22 Attio' },
  { href: '/design-lab/vercel-commerce', label: '23 Final Hybrid' },
]

export default function DesignLabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f4f2] text-[#171717]" style={{ colorScheme: 'light' }}>
      <header className="sticky top-0 z-50 border-b border-black/15 bg-[#f4f4f2]">
        <div className="flex min-h-12 items-center justify-between gap-4 px-3 sm:px-5">
          <Link href="/design-lab" className="shrink-0 text-xs font-bold uppercase tracking-[0.16em]">
            PriceVault / Designlabor
          </Link>
          <Link href="/dashboard" className="shrink-0 text-xs font-semibold text-black/60 hover:text-black">
            Zurück zum Dashboard ↗
          </Link>
        </div>

        <nav className="hidden grid-cols-12 border-t border-black/10 lg:grid" aria-label="Designvarianten">
          {concepts.map((concept) => (
            <Link
              key={concept.href}
              href={concept.href}
              className="flex min-h-9 items-center justify-center border-r border-t border-black/10 px-1.5 py-2 text-center text-[10px] font-semibold text-black/55 transition hover:bg-white hover:text-black focus-visible:bg-white focus-visible:text-black"
            >
              {concept.label}
            </Link>
          ))}
        </nav>

        <details className="group relative border-t border-black/10 lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-xs font-semibold text-black/65 marker:content-none">
            Alle {concepts.length} Designs anzeigen
            <span className="text-base transition group-open:rotate-45" aria-hidden="true">+</span>
          </summary>
          <nav className="absolute inset-x-0 top-full grid max-h-[65vh] grid-cols-2 overflow-y-auto border-y border-black/15 bg-[#f4f4f2] shadow-[0_18px_40px_rgba(0,0,0,.16)] sm:grid-cols-3" aria-label="Alle Designvarianten">
            {concepts.map((concept) => (
              <Link
                key={concept.href}
                href={concept.href}
                className="flex min-h-11 items-center border-b border-r border-black/10 px-3 py-2 text-xs font-semibold text-black/60 hover:bg-white hover:text-black"
              >
                {concept.label}
              </Link>
            ))}
          </nav>
        </details>
      </header>
      {children}
    </div>
  )
}
