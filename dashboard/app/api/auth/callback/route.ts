import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
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

  return NextResponse.redirect(new URL(tenant ? '/dashboard' : '/onboarding', url.origin))
}
