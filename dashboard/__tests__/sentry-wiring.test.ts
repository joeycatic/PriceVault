import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('Sentry wiring', () => {
  it('captures server requests and client navigation', () => {
    expect(readFileSync('instrumentation.ts', 'utf8')).toContain(
      'Sentry.captureRequestError',
    )
    expect(readFileSync('instrumentation-client.ts', 'utf8')).toContain(
      'Sentry.captureRouterTransitionStart',
    )
  })

  it('captures segment and root rendering failures', () => {
    expect(readFileSync('app/error.tsx', 'utf8')).toContain('Sentry.captureException(error)')
    expect(readFileSync('app/global-error.tsx', 'utf8')).toContain(
      'Sentry.captureException(error)',
    )
  })

  it('wraps the production build with Sentry configuration', () => {
    expect(readFileSync('next.config.mjs', 'utf8')).toContain('withSentryConfig')
  })
})
