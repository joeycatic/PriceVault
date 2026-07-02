import { redirect } from 'next/navigation'

import { DashboardTopbar } from '@/components/ui/DashboardTopbar'
import { Sidebar } from '@/components/ui/Sidebar'
import { currentTenant } from '@/lib/backend'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tenant = await currentTenant()
  if (!tenant) redirect('/onboarding')

  return (
    <div className="min-h-screen bg-vault-950 text-vault-100" data-dashboard-shell>
      <Sidebar shopName={tenant.shop_name} />
      <DashboardTopbar />
      <main id="main" className="px-4 pb-8 pt-6 sm:px-6 lg:ml-60 lg:px-8 lg:pt-0 xl:px-10">
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
    </div>
  )
}
