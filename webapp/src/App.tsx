import React from 'react'
import { GiNuclearBomb } from "react-icons/gi";

class RagApiError extends Error {
  status: number
  remainingTokens?: number

  constructor(message: string, status: number, remainingTokens?: number) {
    super(message)
    this.name = 'RagApiError'
    this.status = status
    this.remainingTokens = remainingTokens
  }
}

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
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let payload: any = null
    try {
      payload = await res.json()
    } catch {
      /* fall back to the HTTP status */
    }
    const detail = payload?.detail
    const message =
      (typeof detail === 'string' && detail) ||
      (typeof detail?.message === 'string' && detail.message) ||
      `Server error: ${res.status}`
    const remainingTokens = Number(detail?.remaining_tokens)
    throw new RagApiError(
      message,
      res.status,
      Number.isFinite(remainingTokens) ? remainingTokens : undefined
    )
  }
  return await res.json()
}

// --- Types ---
type Citation = { title?: string; url?: string }
type Msg = { who: 'you' | 'ai'; text: string; citations?: Citation[]; time?: string }

function estimateTokens(text: string) {
  if (!text) return 0
  return Math.max(1, Math.ceil(new TextEncoder().encode(text).length / 4))
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function enabled(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function readJwtPayload(token?: string) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function trustedAccessUrl(value: unknown) {
  const fallback = 'https://pathway.training/ask-ai/'
  if (typeof value !== 'string' || !value) return fallback
  try {
    const url = new URL(value, fallback)
    const isPathway =
      url.hostname === 'pathway.training' ||
      url.hostname.endsWith('.pathway.training')
    const isLocal =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1'
    const allowed = (url.protocol === 'https:' && isPathway) || isLocal
    return allowed ? url.toString() : fallback
  } catch {
    return fallback
  }
}

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
  const [remainingTokens, setRemainingTokens] = React.useState<number | null>(null)
  const [quotaMessage, setQuotaMessage] = React.useState('')
  const [localAuth, setLocalAuth] = React.useState<{
    apiBase: string
    token: string
  } | null>(null)
  const logRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)
  const cfg = (window as any).RAG_CHATBOT_CONFIG || {}

  const qs = new URLSearchParams(window.location.search)
  const tokenFromUrl = qs.get("token") || undefined
  const expFromUrl = qs.get("exp") || undefined
  const apiBaseFromUrl = qs.get("apiBase") || undefined

  const injectedToken =
    (cfg.token as string | undefined) ||
    tokenFromUrl ||
    localAuth?.token ||
    undefined

  // Prefer URL apiBase (iframe), then WP injected, then prop
  const effectiveApiBase =
    apiBaseFromUrl ||
    localAuth?.apiBase ||
    (cfg.apiBase as string | undefined) ||
    apiBase

  const authToken: string | null = injectedToken ?? null

  const requireAuth =
    enabled(qs.get('requireAuth')) ||
    enabled(cfg.requireAuth) ||
    window.location.hostname === 'chat.pathway.training'
  const accessUrl = trustedAccessUrl(
    qs.get('accessUrl') ||
    cfg.accessUrl ||
    import.meta.env.VITE_RAG_ACCESS_URL
  )
  const requiredCap =
    qs.get('requiredCap') ||
    cfg.requiredCap ||
    'edit_posts'
  const tokenPayload = readJwtPayload(authToken || undefined)
  const tokenExpiry = Number(tokenPayload?.exp || expFromUrl || 0)
  const tokenCaps = Array.isArray(tokenPayload?.cap) ? tokenPayload.cap : []
  const authInvalid = requireAuth && (
    !authToken ||
    !tokenPayload ||
    tokenExpiry <= Math.floor(Date.now() / 1000) ||
    (requiredCap && !tokenCaps.includes(requiredCap))
  )
  const authReady = !authInvalid
  const inputTokenLimit = positiveNumber(
    cfg.inputTokenLimit || import.meta.env.VITE_CHAT_INPUT_TOKEN_LIMIT,
    2000
  )
  const maxOutputTokens = positiveNumber(
    cfg.maxOutputTokens || import.meta.env.VITE_LLM_MAX_OUTPUT_TOKENS,
    1200
  )
  const recentHistory = msgs.slice(-6)
  const historyText = recentHistory
    .map((m) => `${m.who === 'you' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n')
  const requestText = historyText.trim()
    ? `${historyText}\n\nUser: ${q.trim()}`
    : q.trim()
  const estimatedInputTokens = estimateTokens(requestText)
  const exceedsInputTokenLimit = estimatedInputTokens > inputTokenLimit
  const estimatedReservation = estimatedInputTokens + maxOutputTokens
  const exceedsRemainingBalance =
    remainingTokens !== null && estimatedReservation > remainingTokens

  React.useEffect(() => {
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    if (!isLocal || tokenFromUrl || cfg.token) return

    fetch('/__rag-dev-config', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Local auth returned ${response.status}`)
        return response.json()
      })
      .then((config) => {
        if (config?.apiBase && config?.token) setLocalAuth(config)
      })
      .catch(() => {
        setQuotaMessage(
          'Local authentication is unavailable. Start the frontend with Vite and configure the backend .env.'
        )
      })
  }, [cfg.token, tokenFromUrl])

  React.useEffect(() => {
    if (authInvalid) window.location.replace(accessUrl)
  }, [accessUrl, authInvalid])

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

    if (!authReady || !authToken) return

    const query = q.trim()
    if (!query || busy || exceedsInputTokenLimit || exceedsRemainingBalance) return
    setQ('')
    setQuotaMessage('')
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
      const nextRemainingTokens = Number(data.remaining_tokens)
      if (Number.isFinite(nextRemainingTokens)) {
        setRemainingTokens(Math.max(0, nextRemainingTokens))
      }
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
      if (e instanceof RagApiError && (e.status === 401 || e.status === 403) && requireAuth) {
        setBusy(false)
        window.location.replace(accessUrl)
        return
      }
      if (e instanceof RagApiError && e.status === 429 && e.remainingTokens !== undefined) {
        setRemainingTokens(Math.max(0, e.remainingTokens))
        setQuotaMessage(
          e.remainingTokens === 0
            ? 'Your daily AI token balance is exhausted. Please try again after the daily reset.'
            : `This request needs more tokens than your remaining daily balance of ${e.remainingTokens.toLocaleString()}.`
        )
      }
      setMsgs((m) => [
        ...m,
        {
          who: 'ai',
          text:
            e instanceof RagApiError && e.status === 429 && e.remainingTokens !== undefined
              ? 'Your daily AI token balance cannot cover this request.'
              : `Error: ${e.message}`,
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
  if (!authReady) return null

  return (
    <div className="rcb-card" role="complementary" aria-label="RAG Chatbot">
      <div className="rcb-head">
        {/* {title || 'Pathway Chatbot (Beta)'} */}
        <a href="https://pathway.training/" target="_top" rel="noreferrer">
          <img
            src="/Logo.png"
            alt="Pathway Logo"
            className="header-logo"
            style={{ cursor: "pointer" }}
          />
        </a>


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
        <div className="composer">
          <div
            className="token-estimate"
            data-over-limit={exceedsInputTokenLimit || exceedsRemainingBalance}
          >
            ~{estimatedInputTokens.toLocaleString()} / {inputTokenLimit.toLocaleString()} input tokens
            {' · '}
            {maxOutputTokens.toLocaleString()} max response
            {remainingTokens !== null && (
              <>
                {' / '}
                {remainingTokens.toLocaleString()} daily tokens remaining
              </>
            )}
          </div>
          {quotaMessage && (
            <div className="quota-alert" role="alert">
              {quotaMessage}
            </div>
          )}
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
              disabled={
                busy ||
                !authToken ||
                exceedsInputTokenLimit ||
                exceedsRemainingBalance
              }
              style={busy ? { minWidth: `${longestText.length + 2}ch`, textAlign: 'center' } : {}}
            >
              {busy ? `Thinking${thinkingDots}` : 'Send'}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
