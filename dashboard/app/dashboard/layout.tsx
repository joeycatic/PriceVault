import { redirect } from 'next/navigation'

import { Sidebar } from '@/components/ui/Sidebar'
import { createClient } from '@/lib/supabase/server'
import type { Tenant } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('tenants')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  const tenant = data as Tenant | null

  return (
    <div className="min-h-screen">
      <Sidebar shopName={tenant?.shop_name ?? 'Mandant nicht eingerichtet'} />
      <main id="main" className="px-4 py-7 sm:px-7 lg:ml-64 lg:px-10 lg:py-10 xl:px-14">
        <div className="mx-auto max-w-[1500px]">{children}</div>
      </main>
    </div>
  )
}

