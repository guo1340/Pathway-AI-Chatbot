export type ChatChunk = {
  role: 'assistant' | 'tool' | 'system'
  content: string
  citations?: { title?: string; url?: string }[]
}

export async function askRag(
  apiBase: string,
  token: string,
  payload: {
    query: string
    source?: string
    conversation_id?: string
  }
): Promise<{
  answer: string
  citations?: { title?: string; url?: string }[]
  conversation_id: string
  remaining_tokens: number
}> {

  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RAG backend error ${res.status}: ${text}`)
  }

  return res.json()
}
