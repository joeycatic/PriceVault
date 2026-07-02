import Link from 'next/link'
import type { ReactNode } from 'react'

export function PublicHeader({ dashboardAvailable = false }: { dashboardAvailable?: boolean }) {
  return (
    <header className="border-b border-vault-700 bg-white">
      <div className="mx-auto flex min-h-16 max-w-[1280px] items-center justify-between gap-5 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="PriceVault Startseite">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-vault-100 text-xs font-black text-white">PV</span>
          <span className="font-bold">PriceVault</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-vault-300 md:flex" aria-label="Seitennavigation">
          <Link href="/#funktionen" className="hover:text-vault-100">Funktionen</Link>
          <Link href="/#integrationen" className="hover:text-vault-100">Integrationen</Link>
          <Link href="/#preise" className="hover:text-vault-100">Preise</Link>
          <Link href="/#faq" className="hover:text-vault-100">FAQ</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-vault-300 hover:bg-vault-800 sm:flex">Einloggen</Link>
          <Link href={dashboardAvailable ? '/dashboard' : '/signup'} className="button-primary min-h-10 px-3 py-2 text-xs sm:px-4 sm:text-sm">
            {dashboardAvailable ? 'Dashboard öffnen' : 'Kostenlos starten'}
          </Link>
        </div>
      </div>
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="border-t border-vault-700 bg-white">
      <div className="mx-auto grid max-w-[1280px] gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-vault-100 text-[10px] font-black text-white">PV</span>
            <span className="text-sm font-bold">PriceVault</span>
          </div>
          <p className="mt-3 max-w-md text-sm leading-6 text-vault-500">Wettbewerbspreise, Verfügbarkeit und Marktbewegungen für DACH E-Commerce-Teams.</p>
          <p className="mt-4 text-xs text-vault-500">© 2026 PriceVault</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-vault-500" aria-label="Rechtliches">
          <Link href="/impressum" className="hover:text-vault-100">Impressum</Link>
          <Link href="/datenschutz" className="hover:text-vault-100">Datenschutz</Link>
          <Link href="/agb" className="hover:text-vault-100">AGB</Link>
          <Link href="/widerruf" className="hover:text-vault-100">Kündigung</Link>
          <Link href="/dpa" className="hover:text-vault-100">DPA</Link>
        </nav>
      </div>
    </footer>
  )
}

export function LegalPageLayout({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-vault-950">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-sm text-vault-500">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{title}</h1>
        <section className="panel mt-8 space-y-5 p-6 text-sm leading-7 text-vault-300 sm:p-8">{children}</section>
      </main>
      <PublicFooter />
    </div>
  )
}
