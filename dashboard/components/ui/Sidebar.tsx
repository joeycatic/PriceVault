'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import { useSupabase } from '@/components/providers/SupabaseProvider'
import { cn } from '@/lib/utils'

const links = [
  { href: '/dashboard', label: 'Preisübersicht', mark: '01' },
  { href: '/dashboard/competitors', label: 'Mitbewerber', mark: '02' },
  { href: '/dashboard/products', label: 'Produkte', mark: '03' },
  { href: '/dashboard/alerts', label: 'Preisalarme', mark: '04' },
]

export function Sidebar({ shopName }: { shopName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { supabase } = useSupabase()

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <aside className="border-b border-vault-700 bg-vault-900/95 lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex h-20 items-center justify-between border-b border-vault-700 px-5 lg:h-24 lg:px-7">
        <Link href="/dashboard" className="flex items-center gap-3" aria-label="PriceVault Startseite">
          <span className="grid h-9 w-9 place-items-center bg-vault-lime text-sm font-black text-vault-950 shadow-lime">PV</span>
          <span className="font-bold tracking-tight">PriceVault</span>
        </Link>
        <span className="font-mono text-[10px] text-vault-500">V1.0</span>
      </div>

      <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:gap-1.5 lg:p-5" aria-label="Hauptnavigation">
        {links.map((link) => {
          const active =
            link.href === '/dashboard' ? pathname === link.href : pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'group flex min-h-11 shrink-0 items-center gap-3 border border-transparent px-3 py-2.5 text-sm font-medium text-vault-300 transition lg:w-full',
                active
                  ? 'border-vault-lime/30 bg-vault-lime/10 text-vault-100'
                  : 'hover:border-vault-700 hover:bg-vault-800 hover:text-vault-100',
              )}
            >
              <span className={cn('font-mono text-[10px] text-vault-500', active && 'text-vault-lime')}>
                {link.mark}
              </span>
              {link.label}
            </Link>
          )
        })}
      </nav>

      <div className="hidden border-t border-vault-700 p-5 lg:block">
        <p className="mb-1 truncate text-sm font-semibold">{shopName}</p>
        <p className="mb-4 text-[10px] uppercase tracking-[0.16em] text-vault-500">Mandant aktiv</p>
        <Link href="/onboarding" className="mb-2 flex min-h-10 items-center text-xs font-semibold text-vault-300 hover:text-vault-lime">
          Einrichtung öffnen →
        </Link>
        <button onClick={logout} className="button-secondary w-full" type="button">
          Abmelden
        </button>
      </div>
    </aside>
  )
}
