import { redirect } from 'next/navigation'

import { Sidebar } from '@/components/ui/Sidebar'
import { currentTenant } from '@/lib/backend'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tenant = await currentTenant()
  if (!tenant) redirect('/onboarding')

  return (
    <div className="min-h-screen">
      <Sidebar shopName={tenant.shop_name} />
      <main id="main" className="px-4 py-7 sm:px-7 lg:ml-64 lg:px-10 lg:py-10 xl:px-14">
        <div className="mx-auto max-w-[1500px]">{children}</div>
      </main>
    </div>
  )
}
