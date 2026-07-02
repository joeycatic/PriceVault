import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next')
  if (!code) {
    return NextResponse.redirect(new URL('/login?auth_error=missing_code', url.origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/callback] code exchange failed', {
      message: error.message,
      status: error.status,
    })
    return NextResponse.redirect(new URL('/login?auth_error=exchange_failed', url.origin))
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: tenant } = user
    ? await supabase.from('tenants').select('id').limit(1).maybeSingle()
    : { data: null }

  if (next?.startsWith('/')) {
    if (!tenant && next.startsWith('/dashboard')) {
      const onboardingUrl = new URL('/onboarding', url.origin)
      onboardingUrl.searchParams.set('next', next)
      if (next.startsWith('/dashboard/account')) {
        onboardingUrl.searchParams.set('account_setup', '1')
      }
      return NextResponse.redirect(onboardingUrl)
    }
    return NextResponse.redirect(new URL(next, url.origin))
  }

  return NextResponse.redirect(new URL(tenant ? '/dashboard' : '/onboarding', url.origin))
}
