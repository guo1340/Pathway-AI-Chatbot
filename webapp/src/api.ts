export type ChatChunk = {
  role: 'assistant' | 'tool' | 'system'
  content: string
  citations?: { title?: string; url?: string }[]
}

export async function askRag(
  apiBase: string,
  payload: {
    query: string
    source?: string
    conversation_id?: string
  }
): Promise<{ answer: string; citations?: { title?: string; url?: string }[]; conversation_id: string }> {

  // Minimal fetch to your RAG backend; adapt to your stack.
  // Expected backend route: POST /api/chat
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RAG backend error ${res.status}: ${text}`)
  }

  return res.json()
}