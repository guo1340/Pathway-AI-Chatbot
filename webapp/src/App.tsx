import React from 'react'
import { GiNuclearBomb } from "react-icons/gi";

// --- Inline API call (replaces need for api.ts) ---
async function askRag(
  apiBase: string,
  body: {
    query: string
    source?: string
    conversation_id?: string
    history?: Msg[]   // full message history
  }
): Promise<any> {
  const res = await fetch(`${apiBase}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Server error: ${res.status}`)
  }
  return await res.json()
}

// --- Types ---
type Citation = { title?: string; url?: string }
type Msg = { who: 'you' | 'ai'; text: string; citations?: Citation[]; time?: string }

// --- Main Component ---
export default function App({
  apiBase,
  source,
  title,
}: {
  apiBase: string
  source?: string
  title?: string
}) {
  const [msgs, setMsgs] = React.useState<Msg[]>([])
  const [q, setQ] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [convId, setConvId] = React.useState<string | undefined>(undefined)
  const logRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)

  // 🧠 Load conversation from sessionStorage on mount
  React.useEffect(() => {
    const stored = sessionStorage.getItem('chat_history')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) setMsgs(parsed)
      } catch {
        /* ignore parse errors */
      }
    }
  }, [])

  // 🧠 Save messages to sessionStorage on every update
  React.useEffect(() => {
    sessionStorage.setItem('chat_history', JSON.stringify(msgs))
  }, [msgs])

  // ---- helpers ----
  function basenameFromUrl(u?: string) {
    try {
      if (!u) return undefined
      const clean = u.replace(/^file:\/\//, '')
      const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
      return clean.slice(lastSlash + 1)
    } catch {
      return undefined
    }
  }

  function toHttpUrl(c: Citation, apiBase: string) {
    if (!c.url) return undefined
    if (c.url.startsWith('http')) return c.url
    if (c.url.startsWith('/')) return c.url
    if (c.url.startsWith('file://')) {
      const name = basenameFromUrl(c.url)
      if (name) {
        const [file, fragment] = name.split('#')
        const safeFile = encodeURIComponent(file)
        const fragPart = fragment ? `#${fragment}` : ''
        return `${apiBase.replace(/\/$/, '')}/api/files/${safeFile}${fragPart}`
      }
    }
    return c.url
  }

  function dedupeCitations(citations?: Citation[]) {
    if (!citations?.length) return []
    const seen = new Set<string>()
    const out: Citation[] = []
    for (const c of citations) {
      const key = (basenameFromUrl(c.url) || c.title || '').trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(c)
    }
    return out
  }

  // ---- send message ----
  async function send() {
    const query = q.trim()
    if (!query || busy) return
    setQ('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    const newUserMsg: Msg = {
      who: 'you',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMsgs((m) => [...m, newUserMsg])
    setBusy(true)
    try {
      const data = await askRag(apiBase, {
        query,
        source,
        conversation_id: convId,
        history: msgs, // send full conversation memory
      })

      setConvId(data.conversation_id)
      const answer = data.answer || ''
      const citations: Citation[] | undefined = data.citations

      setMsgs((m) => [
        ...m,
        {
          who: 'ai',
          text: '',
          citations,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])

      // Typing animation
      await new Promise<void>((resolve) => {
        let i = 0
        const step = () => {
          i = Math.min(i + 2, answer.length)
          setMsgs((m) => {
            if (!m.length) return m
            const lastIdx = m.length - 1
            const last = m[lastIdx]
            if (last.who !== 'ai') return m
            const next = [...m]
            next[lastIdx] = { ...last, text: answer.slice(0, i) }
            return next
          })
          if (i < answer.length) setTimeout(step, 16)
          else resolve()
        }
        setTimeout(step, 16)
      })
    } catch (e: any) {
      setMsgs((m) => [
        ...m,
        {
          who: 'ai',
          text: `Error: ${e.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    }
    setBusy(false)
  }

  // auto-scroll to bottom on new messages
  React.useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  // 🧠 Optional clear chat button
  function clearConversation() {
    setMsgs([])
    setConvId(undefined)
    sessionStorage.removeItem('chat_history')
  }

  // ---- render ----
  return (
    <div className="rcb-card" role="complementary" aria-label="RAG Chatbot">
      <div className="rcb-head">
        {title || 'Pathway Chatbot (Beta)'}
        <button
          onClick={clearConversation}
          className="clear-btn"
          title="Clear chat memory"
        >
          <GiNuclearBomb />
        </button>
        {/* this needs a better icon */}
      </div>

      <div className="rcb-log" id="rcb-log" ref={logRef}>
        {msgs.length === 0 ? (
          <div className="rcb-msg ai">
            <span className="ai-title">Pathway's bot:</span>
            <p className="ai-text">👋 Hi there! Got a question? I’m here to help.</p>
          </div>
        ) : (
          msgs.map((m, i) => {
            const deduped = dedupeCitations(m.citations)

            function renderWithInlineCitations(text: string, citations?: Citation[]) {
              if (!citations?.length) return text
              return text.split(/(\[\d+\])/g).map((part, i) => {
                const match = part.match(/\[(\d+)\]/)
                if (!match) return part
                const idx = parseInt(match[1], 10) - 1
                const citation = citations[idx]
                if (!citation) return part
                const href = toHttpUrl(citation, apiBase)
                const title =
                  citation.title || basenameFromUrl(citation.url) || 'source'
                return (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={title}
                    className="inline-citation"
                  >
                    [{match[1]}]
                  </a>
                )
              })
            }

            return (
              <div key={i} className={`rcb-msg ${m.who}`}>
                <div className="message-container">
                  <span className="ai-title">
                    {m.who === 'you' ? 'You:' : "Pathway's bot:"}
                  </span>
                  <div className={m.who === 'you' ? 'user-text' : 'ai-text'}>
                    {renderWithInlineCitations(m.text, m.citations)}
                  </div>
                  {m.who === 'ai' && <div className="timestamp">{m.time}</div>}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="rcb-row">
        <textarea
          ref={inputRef}
          id="message"
          placeholder="Type a message..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          rows={1}
          className="chat-input"
        />
        <button
          className={busy ? '' : 'send-button'}
          onClick={send}
          disabled={busy}
        >
          {busy ? 'Thinking…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
