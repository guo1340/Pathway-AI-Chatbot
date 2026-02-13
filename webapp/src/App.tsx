import React from 'react'
import { GiNuclearBomb } from "react-icons/gi";

// --- Inline API call (replaces need for api.ts) ---
async function askRag(
  apiBase: string,
  token: string,
  body: {
    query: string
    source?: string
    conversation_id?: string
    history?: Msg[]   // full message history
  }
): Promise<any> {
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
  const [thinkingDots, setThinkingDots] = React.useState('');
  const longestText = 'Thinking...';
  const [convId, setConvId] = React.useState<string | undefined>(undefined)
  const logRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)
  const cfg = (window as any).RAG_CHATBOT_CONFIG || {}
  const injectedToken = (cfg.token as string | undefined) || undefined

  // Prefer WP-injected apiBase when available
  const effectiveApiBase = (cfg.apiBase as string | undefined) || apiBase

  const [authToken] = React.useState<string | null>(injectedToken || null)
  const [authReady] = React.useState(true)




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

  // Animate "Thinking..." dots while busy
  React.useEffect(() => {
    if (!busy) {
      setThinkingDots('');
      return;
    }

    let count = 0;
    const interval = setInterval(() => {
      count = (count + 1) % 4; // cycles 0→1→2→3→0
      setThinkingDots('.'.repeat(count));
    }, 500);

    return () => clearInterval(interval);
  }, [busy]);


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

  function appendToken(url: string, token?: string | null) {
    if (!token) return url
    const [base, hash] = url.split('#')
    const join = base.includes('?') ? '&' : '?'
    return `${base}${join}token=${encodeURIComponent(token)}${hash ? `#${hash}` : ''}`
  }

  function toHttpUrl(c: Citation, apiBase: string, token?: string | null) {
    if (!c.url) return undefined

    // Absolute URL already
    if (c.url.startsWith('http')) {
      // If it is your secured file endpoint, add token
      if (c.url.includes('/api/files/')) {
        return appendToken(c.url, token)
      }
      return c.url
    }

    // If it is already a root-relative path
    if (c.url.startsWith('/')) {
      const abs = `${apiBase.replace(/\/$/, '')}${c.url}`
      if (abs.includes('/api/files/')) return appendToken(abs, token)
      return abs
    }

    // file://... -> convert to /api/files/<name>
    if (c.url.startsWith('file://')) {
      const name = basenameFromUrl(c.url)
      if (name) {
        const [file, fragment] = name.split('#')
        const safeFile = encodeURIComponent(file)
        const fragPart = fragment ? `#${fragment}` : ''
        const abs = `${apiBase.replace(/\/$/, '')}/api/files/${safeFile}${fragPart}`
        return appendToken(abs, token)
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

    if (!authReady) return
    if (!authToken) {
      setMsgs((m) => [...m, { who: 'ai', text: 'Not authorized.' }])
      return
    }

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
      const data = await askRag(effectiveApiBase, authToken, {
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

  function handleRipple(e: React.MouseEvent<HTMLButtonElement>) {
    const button = e.currentTarget;
    button.classList.remove("ripple-active"); // reset if still active
    void button.offsetWidth; // force reflow to restart animation
    button.classList.add("ripple-active");

    // optional: remove after animation ends
    setTimeout(() => button.classList.remove("ripple-active"), 600);
  }

  // ---- render ----
  return (
    <div className="rcb-card" role="complementary" aria-label="RAG Chatbot">
      <div className="rcb-head">
        {/* {title || 'Pathway Chatbot (Beta)'} */}
        <img src="/Logo.png" alt="Pathway Logo" className="header-logo" />
        <button
          onClick={(e) => {
            handleRipple(e);
            clearConversation();
          }
          }
          className="clear-btn"
          title="Clear chat memory"
        >
          <GiNuclearBomb />
        </button>
        {/* this needs a better icon */}
      </div>

      <div className="rcb-log" id="rcb-log" ref={logRef}>
        {msgs.length === 0 ? (
          <>
            <div className="rcb-msg ai">
              <span className="ai-title">Pathway's bot:</span>
              <p className="ai-text">👋 Hi there! Got a question? I’m here to help.</p>
            </div>
          </>
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
                const href = toHttpUrl(citation, effectiveApiBase, authToken)
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
                  <div
                    className={m.who === 'you' ? 'user-text' : 'ai-text'}
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {renderWithInlineCitations(
                      m.text
                        // turn leading "- " into bullets
                        .replace(/^-+\s+/gm, '• ')
                        // remove stray "-" before citations or EOL
                        .replace(/\s*-\s*(?=\[\d+\]|\n|$)/g, ''),
                      deduped
                    )}

                  </div>
                  {m.who === 'ai' && <div className="timestamp">{m.time}</div>}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="chat-disclaimer-wrap">
        <div className="chat-disclaimer">
          ⚠️ This bot can make mistakes — please check the sources given at the end of each answer.
        </div>
      </div>
      <div className='question-container'>
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
            style={busy ? { minWidth: `${longestText.length + 2}ch`, textAlign: 'center' } : {}}
          >
            {busy ? `Thinking${thinkingDots}` : 'Send'}
          </button>
        </div>
      </div>

    </div>
  )
}
