'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type ActionState = {
  ok: boolean
  message: string
}

export async function updateRecoveredPassword(_state: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirm_password') ?? '')
  if (password.length < 8) {
    return { ok: false, message: 'Das Passwort muss mindestens 8 Zeichen lang sein.' }
  }
  if (password !== confirmPassword) {
    return { ok: false, message: 'Die Passwörter stimmen nicht überein.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { ok: false, message: 'Das Passwort konnte nicht aktualisiert werden.' }

  redirect('/dashboard/account?password=updated')
}
