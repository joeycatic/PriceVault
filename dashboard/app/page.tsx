import { redirect } from 'next/navigation'

import { currentTenant } from '@/lib/backend'

export default async function HomePage() {
  const tenant = await currentTenant()
  redirect(tenant ? '/dashboard' : '/onboarding')
}
