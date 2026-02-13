import React from 'react'
import { GiNuclearBomb } from "react-icons/gi"

type Citation = { title?: string; url?: string }
type Msg = { who: 'you' | 'ai'; text: string; citations?: Citation[]; time?: string }

async function askRag(
  apiBase: string,
  token: string,
  body: {
    query: string
    source?: string
    conversation_id?: string
    history?: Msg[]
  }
) {
  const res = await fetch(`${apiBase}/api/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Server error: ${res.status}`)
  }

  return await res.json()
}

export default function App({
  apiBase,
  source,
  title,
}: {
  apiBase: string
  source?: string
  title?: string
}) {

  const cfg = (window as any).RAG_CHATBOT_CONFIG || {}
  const authToken: string | undefined = cfg.token
  const effectiveApiBase = cfg.apiBase || apiBase

  const [msgs, setMsgs] = React.useState<Msg[]>([])
  const [q, setQ] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [convId, setConvId] = React.useState<string | undefined>(undefined)
  const logRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => {
    const stored = sessionStorage.getItem('chat_history')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) setMsgs(parsed)
      } catch { }
    }
  }, [])

  React.useEffect(() => {
    sessionStorage.setItem('chat_history', JSON.stringify(msgs))
  }, [msgs])

  React.useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  async function send() {

    if (!authToken) {
      setMsgs((m) => [...m, { who: 'ai', text: 'Authorization token missing.' }])
      return
    }

    const query = q.trim()
    if (!query || busy) return

    setQ('')
    setBusy(true)

    const newUserMsg: Msg = {
      who: 'you',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMsgs((m) => [...m, newUserMsg])

    try {
      const data = await askRag(effectiveApiBase, authToken, {
        query,
        source,
        conversation_id: convId,
        history: msgs,
      })

      setConvId(data.conversation_id)

      const aiMsg: Msg = {
        who: 'ai',
        text: data.answer || '',
        citations: data.citations,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMsgs((m) => [...m, aiMsg])

    } catch (e: any) {
      setMsgs((m) => [...m, {
        who: 'ai',
        text: `Error: ${e.message}`,
      }])
    }

    setBusy(false)
  }

  return (
    <div className="rcb-card">
      <div className="rcb-head">
        <img src="/Logo.png" alt="Pathway Logo" className="header-logo" />
      </div>

      <div className="rcb-log" ref={logRef}>
        {msgs.length === 0 && (
          <div className="rcb-msg ai">
            👋 Hi there! Ask me anything.
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`rcb-msg ${m.who}`}>
            <div className="message-container">
              <strong>{m.who === 'you' ? 'You:' : "Pathway's bot:"}</strong>
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {m.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rcb-row">
        <textarea
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Type a message..."
        />
        <button onClick={send} disabled={busy}>
          {busy ? 'Thinking...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
