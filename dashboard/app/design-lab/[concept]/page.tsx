import { notFound } from 'next/navigation'

import { ConceptPreview, type ConceptName } from '@/components/design-lab/ConceptPreviews'

const concepts: ConceptName[] = ['hygraph', 'vercel', 'control-room', 'ledger']

export function generateStaticParams() {
  return concepts.map((concept) => ({ concept }))
}

export default async function ConceptPage({ params }: { params: Promise<{ concept: string }> }) {
  const { concept } = await params
  if (!concepts.includes(concept as ConceptName)) notFound()

  return <ConceptPreview concept={concept as ConceptName} />
}
