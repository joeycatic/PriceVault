import { redirect } from 'next/navigation'

import { DashboardTopbar } from '@/components/ui/DashboardTopbar'
import { Sidebar } from '@/components/ui/Sidebar'
import { currentTenant, listTenantsForUser } from '@/lib/backend'

function initialsFromName(name: string) {
  const parts = name
    .replace(/[^a-zA-ZÄÖÜäöüß0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (!parts.length) return 'PV'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tenant = await currentTenant()
  if (!tenant) redirect('/onboarding')
  const tenants = await listTenantsForUser()

  return (
    <div className="min-h-screen bg-vault-950 text-vault-100" data-dashboard-shell>
      <Sidebar shopName={tenant.shop_name} plan={tenant.plan} tenants={tenants} currentTenantId={tenant.id} />
      <DashboardTopbar accountInitials={initialsFromName(tenant.shop_name)} accountLabel={tenant.shop_name} />
      <main id="main" className="px-4 pb-8 pt-6 sm:px-6 lg:ml-60 lg:px-8 lg:pt-0 xl:px-10">
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
    </div>
  )
}
