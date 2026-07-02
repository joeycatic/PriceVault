'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import { useSupabase } from '@/components/providers/SupabaseProvider'
import { cn } from '@/lib/utils'

const links = [
  { href: '/dashboard', label: 'Preisübersicht', mark: '01', icon: 'overview' },
  { href: '/dashboard/competitors', label: 'Mitbewerber', mark: '02', icon: 'competitors' },
  { href: '/dashboard/company', label: 'Unternehmen', mark: '03', icon: 'company' },
  { href: '/dashboard/products', label: 'Produkte', mark: '04', icon: 'products' },
  { href: '/dashboard/alerts', label: 'Preisalarme', mark: '05', icon: 'alerts' },
  { href: '/dashboard/alerts/channels', label: 'Kanäle', mark: '06', icon: 'channels' },
  { href: '/dashboard/reports', label: 'Reports', mark: '07', icon: 'reports' },
  { href: '/dashboard/scrapes', label: 'Scrape-Jobs', mark: '08', icon: 'scrapes' },
  { href: '/dashboard/usage', label: 'Nutzung', mark: '09', icon: 'usage' },
  { href: '/dashboard/admin', label: 'Support', mark: '10', icon: 'support' },
]

type NavIconName = (typeof links)[number]['icon']

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    className: 'h-4 w-4',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  }

  switch (name) {
    case 'overview':
      return <svg {...common}><path d="M4 13h4l2-6 4 10 2-4h4" /><path d="M4 19h16" /></svg>
    case 'competitors':
      return <svg {...common}><path d="M8 8a3 3 0 1 0 0 6" /><path d="M16 8a3 3 0 1 1 0 6" /><path d="M3 19c1-3 3-5 5-5" /><path d="M21 19c-1-3-3-5-5-5" /></svg>
    case 'company':
      return <svg {...common}><path d="M5 20V6l7-3 7 3v14" /><path d="M9 20v-5h6v5" /><path d="M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01" /></svg>
    case 'products':
      return <svg {...common}><path d="M4 8l8-4 8 4-8 4-8-4Z" /><path d="M4 8v8l8 4 8-4V8" /><path d="M12 12v8" /></svg>
    case 'alerts':
      return <svg {...common}><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
    case 'channels':
      return <svg {...common}><path d="M4 12h4" /><path d="M16 12h4" /><path d="M8 12a4 4 0 0 1 8 0" /><path d="M12 16v4" /><path d="M12 4v4" /></svg>
    case 'reports':
      return <svg {...common}><path d="M5 19V5h14v14H5Z" /><path d="M9 15V9" /><path d="M12 15v-4" /><path d="M15 15V7" /></svg>
    case 'scrapes':
      return <svg {...common}><path d="M4 7h10" /><path d="M4 12h16" /><path d="M4 17h8" /><path d="M17 6l3 3-3 3" /></svg>
    case 'usage':
      return <svg {...common}><path d="M4 14a8 8 0 1 1 16 0" /><path d="M12 14l4-5" /><path d="M7 18h10" /></svg>
    case 'support':
      return <svg {...common}><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z" /><path d="M12 8v5" /><path d="M12 17h.01" /></svg>
  }
}

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

      <nav className="no-scrollbar flex gap-2 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:p-5" aria-label="Hauptnavigation">
        {links.map((link) => {
          const active =
            link.href === '/dashboard' ? pathname === link.href : pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'group relative flex min-h-11 shrink-0 items-center gap-3 border px-3 py-2.5 text-sm font-medium text-vault-300 transition lg:w-full',
                active
                  ? 'border-vault-lime/35 bg-vault-lime/[0.085] text-vault-100 shadow-lime'
                  : 'border-vault-700/45 bg-vault-950/20 hover:border-vault-500 hover:bg-vault-800/85 hover:text-vault-100',
              )}
            >
              <span className={cn('grid h-7 w-7 shrink-0 place-items-center border transition', active ? 'border-vault-lime/45 bg-vault-lime/10 text-vault-lime' : 'border-vault-700 bg-vault-900 text-vault-500 group-hover:border-vault-500 group-hover:text-vault-100')}>
                <NavIcon name={link.icon} />
              </span>
              <span className={cn('font-mono text-[10px] text-vault-500', active && 'text-vault-lime')}>
                {link.mark}
              </span>
              <span className="whitespace-nowrap">{link.label}</span>
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
