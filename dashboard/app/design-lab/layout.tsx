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
]

export default function DesignLabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f4f2] text-[#171717]" style={{ colorScheme: 'light' }}>
      <header className="sticky top-0 z-50 flex min-h-12 items-center justify-between gap-4 border-b border-black/15 bg-[#f4f4f2] px-3 sm:px-5">
        <Link href="/design-lab" className="shrink-0 text-xs font-bold uppercase tracking-[0.16em]">
          PriceVault / Designlabor
        </Link>
        <nav className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Designvarianten">
          {concepts.map((concept) => (
            <Link
              key={concept.href}
              href={concept.href}
              className="shrink-0 border border-transparent px-3 py-2 text-[11px] font-semibold text-black/55 transition hover:border-black/20 hover:bg-white hover:text-black focus-visible:border-black"
            >
              {concept.label}
            </Link>
          ))}
        </nav>
        <Link href="/dashboard" className="hidden shrink-0 text-xs font-semibold text-black/60 hover:text-black sm:block">
          Zurück zum Dashboard ↗
        </Link>
      </header>
      {children}
    </div>
  )
}
