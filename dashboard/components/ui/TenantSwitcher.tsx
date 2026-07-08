'use client'

import { Check, ChevronDown, Store } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'

import type { Tenant } from '@/lib/types'
import { cn } from '@/lib/utils'

export function TenantSwitcher({
  tenants,
  currentTenantId,
}: {
  tenants: Tenant[]
  currentTenantId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const current = tenants.find((tenant) => tenant.id === currentTenantId)

  useEffect(() => {
    if (!open) return
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (tenants.length < 2 || !current) return null

  function selectTenant(tenantId: string) {
    startTransition(async () => {
      const response = await fetch('/api/tenant/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      if (response.ok) {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <div ref={ref} className="relative mx-3 mt-3">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-3 rounded-lg bg-white px-3 text-left text-vault-100 shadow-sm transition hover:bg-vault-950"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-vault-950 text-vault-100">
          <Store className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{current.shop_name}</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-vault-500">Mandant wechseln</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-vault-500 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-xl border border-vault-700 bg-white shadow-xl"
        >
          <div className="border-b border-vault-700 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-vault-500">Mandant wechseln</p>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                role="menuitemradio"
                aria-checked={tenant.id === currentTenantId}
                disabled={pending}
                onClick={() => selectTenant(tenant.id)}
                className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-vault-300 transition hover:bg-vault-950 hover:text-vault-100 focus:bg-vault-950 focus:text-vault-100 focus:outline-none"
              >
                <span className="min-w-0 flex-1 truncate">{tenant.shop_name}</span>
                {tenant.id === currentTenantId && <Check className="h-4 w-4 text-merchant-success" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function TenantOpenButton({
  tenantId,
  children,
}: {
  tenantId: string
  children: ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="button-secondary"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const response = await fetch('/api/tenant/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId }),
          })
          if (response.ok) router.push('/dashboard')
        })
      }}
    >
      {pending ? 'Öffnet …' : children}
    </button>
  )
}
