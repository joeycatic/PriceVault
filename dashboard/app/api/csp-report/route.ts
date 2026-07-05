export async function POST(request: Request) {
  const backend = process.env.BACKEND_URL?.replace(/\/$/, '')
  if (!backend) return new Response(null, { status: 204 })
  const body = await request.text()
  await fetch(`${backend}/csp-report`, {
    method: 'POST',
    headers: { 'Content-Type': request.headers.get('content-type') ?? 'application/csp-report' },
    body: body.slice(0, 32_000),
    cache: 'no-store',
  }).catch(() => undefined)
  return new Response(null, { status: 204 })
}
