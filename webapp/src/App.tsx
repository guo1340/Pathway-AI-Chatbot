import React from 'react'
import { IoClose, IoInformationCircleOutline } from "react-icons/io5";

const WORDPRESS_LOGIN_URL = 'https://pathway.training/wp-login.php'

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

async function loadRagHistory(apiBase: string, token: string): Promise<any> {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/history`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`History request failed: ${res.status}`)
  return await res.json()
}

async function clearRagConversation(apiBase: string, token: string): Promise<any> {
  const res = await fetch(
    `${apiBase.replace(/\/$/, '')}/api/conversation/clear`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }
  )
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
type Msg = {
  who: 'you' | 'ai'
  text: string
  citations?: Citation[]
  time?: string
  pending?: boolean
}
type Notice = {
  title: string
  message: string
  redirecting?: boolean
}

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
  const [convId, setConvId] = React.useState<string | undefined>(undefined)
  const [remainingTokens, setRemainingTokens] = React.useState<number | null>(null)
  const [quotaMessage, setQuotaMessage] = React.useState('')
  const [authChecking, setAuthChecking] = React.useState(true)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const [infoDialogOpen, setInfoDialogOpen] = React.useState(false)
  const [clearDialogOpen, setClearDialogOpen] = React.useState(false)
  const [localAuth, setLocalAuth] = React.useState<{
    apiBase: string
    token: string
  } | null>(null)
  const logRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)
  const redirectTimerRef = React.useRef<number | null>(null)
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
  const tokenPayloadValid = Boolean(tokenPayload)
  const hasRequiredCap = !requiredCap || tokenCaps.includes(requiredCap)
  const authInvalid = requireAuth && (
    !authToken ||
    !tokenPayloadValid ||
    tokenExpiry <= Math.floor(Date.now() / 1000) ||
    !hasRequiredCap
  )
  const authReady = !authInvalid
  const inputTokenLimit = positiveNumber(
    cfg.inputTokenLimit || import.meta.env.VITE_CHAT_INPUT_TOKEN_LIMIT,
    2000
  )
  const queryMaxLength = positiveNumber(
    cfg.queryMaxLength || import.meta.env.VITE_CHAT_QUERY_MAX_LENGTH,
    4000
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
    let active = true
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    if (!isLocal || tokenFromUrl || cfg.token) {
      setAuthChecking(false)
      return
    }

    fetch('/__rag-dev-config', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Local auth returned ${response.status}`)
        return response.json()
      })
      .then((config) => {
        if (active && config?.apiBase && config?.token) setLocalAuth(config)
      })
      .catch(() => {
        if (active) {
          setNotice({
            title: 'Local authentication unavailable',
            message: 'Start the frontend with Vite and configure the backend .env, then reload this page.',
          })
        }
      })
      .finally(() => {
        if (active) setAuthChecking(false)
      })

    return () => {
      active = false
    }
  }, [cfg.token, tokenFromUrl])

  React.useEffect(() => {
    if (authChecking || !authInvalid) return

    let message = 'Please log in to access Ask AI.'
    if (authToken && !tokenPayloadValid) {
      message = 'Your sign-in link is invalid. Please log in again.'
    } else if (authToken && tokenExpiry <= Math.floor(Date.now() / 1000)) {
      message = 'Your session has expired. Please log in again.'
    } else if (!hasRequiredCap) {
      message = 'Your account is not authorized to use Ask AI. Please log in with an authorized account.'
    }

    setNotice({
      title: 'Access required',
      message: `${message} Redirecting to the Pathway login page.`,
      redirecting: true,
    })
    redirectTimerRef.current = window.setTimeout(
      () => window.location.replace(accessUrl),
      1600
    )

    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current)
        redirectTimerRef.current = null
      }
    }
  }, [
    accessUrl,
    authChecking,
    authInvalid,
    authToken,
    hasRequiredCap,
    requiredCap,
    tokenExpiry,
    tokenPayloadValid,
  ])

  React.useEffect(() => {
    if (!clearDialogOpen && !infoDialogOpen && !notice) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (clearDialogOpen) setClearDialogOpen(false)
      else if (infoDialogOpen) setInfoDialogOpen(false)
      else if (!notice?.redirecting) setNotice(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearDialogOpen, infoDialogOpen, notice])

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
    const persistentMsgs = msgs.filter((message) => !message.pending)
    if (persistentMsgs.length) {
      sessionStorage.setItem('chat_history', JSON.stringify(persistentMsgs))
    } else {
      sessionStorage.removeItem('chat_history')
    }
  }, [msgs])

  React.useEffect(() => {
    if (authChecking || !authReady || !authToken) return
    let active = true
    loadRagHistory(effectiveApiBase, authToken)
      .then((data) => {
        if (!active) return
        setMsgs(Array.isArray(data?.messages) ? data.messages : [])
        setConvId(
          typeof data?.conversation_id === 'string'
            ? data.conversation_id
            : undefined
        )
      })
      .catch(() => {
        /* keep sessionStorage as an offline fallback */
      })
    return () => {
      active = false
    }
  }, [authChecking, authReady, authToken, effectiveApiBase])

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

    // Absolute URL already
    if (c.url.startsWith('http')) {
      return c.url
    }

    // If it is already a root-relative path
    if (c.url.startsWith('/')) {
      return `${apiBase.replace(/\/$/, '')}${c.url}`
    }

    // file://... -> convert to /api/files/<name>
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

    if (!authReady || !authToken) return

    const query = q.trim()
    if (!query || busy || exceedsInputTokenLimit) return
    if (exceedsRemainingBalance) {
      const message = `This request may use approximately ${estimatedReservation.toLocaleString()} tokens, but your remaining daily balance is ${remainingTokens?.toLocaleString() || 0}. Shorten the message or try again after the daily reset.`
      setQuotaMessage(message)
      setNotice({
        title: 'Daily token limit',
        message,
      })
      return
    }
    setQ('')
    setQuotaMessage('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    const newUserMsg: Msg = {
      who: 'you',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    const pendingAiMsg: Msg = {
      who: 'ai',
      text: '',
      pending: true,
    }

    setMsgs((m) => [...m.slice(-22), newUserMsg, pendingAiMsg])
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

      setMsgs((m) => {
        const next = [...m]
        let pendingIndex = -1
        for (let index = next.length - 1; index >= 0; index -= 1) {
          if (next[index].pending) {
            pendingIndex = index
            break
          }
        }
        const answerMessage: Msg = {
          who: 'ai',
          text: answer,
          citations,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        if (pendingIndex >= 0) next[pendingIndex] = answerMessage
        else next.push(answerMessage)
        return next.slice(-24)
      })
    } catch (e: any) {
      setMsgs((messages) => messages.filter((message) => !message.pending))
      if (e instanceof RagApiError && (e.status === 401 || e.status === 403) && requireAuth) {
        setBusy(false)
        setNotice({
          title: e.status === 403 ? 'Access denied' : 'Authentication failed',
          message:
            e.status === 403
              ? 'Your account is not authorized to use Ask AI. Redirecting to the Pathway login page.'
              : e.message === 'Token expired'
                ? 'Your session has expired. Please sign in again.'
                : 'The server rejected your sign-in token. Please sign in again. If this continues, the site authentication configuration needs attention.',
          redirecting: true,
        })
        redirectTimerRef.current = window.setTimeout(
          () => window.location.replace(accessUrl),
          1600
        )
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
      setNotice({
        title:
          e instanceof RagApiError && e.status === 429
            ? 'Message could not be sent'
            : 'Response unavailable',
        message:
          e instanceof RagApiError && e.status === 429 && e.remainingTokens !== undefined
            ? 'Your daily AI token balance cannot cover this request.'
            : e instanceof RagApiError && e.status === 429
              ? 'Too many requests were sent. Please wait briefly and try again.'
              : 'The chatbot could not complete this response. Please try again.',
      })
    }
    setBusy(false)
  }

  // auto-scroll to bottom on new messages
  React.useEffect(() => {
    const el = logRef.current
    if (!el) return
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight
    }
    scrollToBottom()
    requestAnimationFrame(scrollToBottom)
    const timer = window.setTimeout(scrollToBottom, 0)
    return () => window.clearTimeout(timer)
  }, [msgs])

  // 🧠 Optional clear chat button
  async function clearConversation() {
    if (!authToken || busy) return
    setBusy(true)
    try {
      const data = await clearRagConversation(effectiveApiBase, authToken)
      const nextRemainingTokens = Number(data?.remaining_tokens)
      if (Number.isFinite(nextRemainingTokens)) {
        setRemainingTokens(Math.max(0, nextRemainingTokens))
      }
      setMsgs([])
      setQ('')
      setConvId(
        typeof data?.conversation_id === 'string'
          ? data.conversation_id
          : undefined
      )
      setQuotaMessage('')
      setClearDialogOpen(false)
      setInfoDialogOpen(false)
      sessionStorage.removeItem('chat_history')
    } catch (e: any) {
      if (e instanceof RagApiError && e.remainingTokens !== undefined) {
        setRemainingTokens(Math.max(0, e.remainingTokens))
      }
      setClearDialogOpen(false)
      setInfoDialogOpen(false)
      setNotice({
        title: 'Chat could not be cleared',
        message:
          e instanceof RagApiError && e.status === 429
            ? 'There are not enough daily tokens to summarize this chat. Your visible history was kept.'
            : 'The chat could not be summarized safely, so your visible history was kept. Please try again.',
      })
    }
    setBusy(false)
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
  if (authChecking) {
    return (
      <div className="status-overlay" role="status" aria-live="polite">
        <div className="status-spinner" aria-hidden="true" />
        <strong>Checking access...</strong>
      </div>
    )
  }

  if (!authReady) {
    return (
      <div className="status-overlay" role="alert" aria-live="assertive">
        <div className="status-spinner" aria-hidden="true" />
        <strong>{notice?.title || 'Access required'}</strong>
        <span>{notice?.message || 'Redirecting to the Pathway login page.'}</span>
      </div>
    )
  }

  return (
    <div className="rcb-card" role="complementary" aria-label="RAG Chatbot">
      {notice && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !notice.redirecting) {
              setNotice(null)
            }
          }}
        >
          <div className="dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby="notice-title">
            {!notice.redirecting && (
              <button
                type="button"
                className="dialog-close"
                onClick={() => setNotice(null)}
                aria-label="Close notification"
                title="Close"
              >
                <IoClose />
              </button>
            )}
            <h2 id="notice-title">{notice.title}</h2>
            <p>{notice.message}</p>
            {notice.redirecting ? (
              <a className="dialog-link-button" href={WORDPRESS_LOGIN_URL} target="_top">
                Go to login
              </a>
            ) : (
              <button type="button" onClick={() => setNotice(null)}>
                Understood
              </button>
            )}
          </div>
        </div>
      )}

      {clearDialogOpen && (
        <div
          className="dialog-backdrop dialog-backdrop-nested"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setClearDialogOpen(false)
          }}
        >
          <div className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="clear-dialog-title">
            <button
              type="button"
              className="dialog-close"
              onClick={() => setClearDialogOpen(false)}
              aria-label="Close clear chat confirmation"
              title="Close"
            >
              <IoClose />
            </button>
            <h2 id="clear-dialog-title">Clear chat history?</h2>
            <p>This summarizes the visible chat for future context, then clears it from view. Summarization uses daily tokens, and existing token usage will not reset.</p>
            <div className="dialog-actions">
              <button type="button" className="dialog-secondary" onClick={() => setClearDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" className="dialog-danger" onClick={clearConversation}>
                Clear chat
              </button>
            </div>
          </div>
        </div>
      )}

      {infoDialogOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInfoDialogOpen(false)
          }}
        >
          <div className="dialog-panel info-dialog" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title">
            <button
              type="button"
              className="dialog-close"
              onClick={() => setInfoDialogOpen(false)}
              aria-label="Close chat information"
              title="Close"
            >
              <IoClose />
            </button>
            <h2 id="info-dialog-title">Chat information</h2>
            <section className="info-dialog-section">
              <h3>Answer guidance</h3>
              <p>This bot can make mistakes — please check the sources given at the end of each answer.</p>
            </section>
            <section className="info-dialog-section">
              <h3>Token usage</h3>
              <dl className="token-grid" data-over-limit={exceedsInputTokenLimit || exceedsRemainingBalance}>
                <dt>Input tokens</dt>
                <dt>Max response</dt>
                <dd>~{estimatedInputTokens.toLocaleString()} / {inputTokenLimit.toLocaleString()}</dd>
                <dd>{maxOutputTokens.toLocaleString()}</dd>
              </dl>
              <div className="daily-token-status" aria-live="polite">
                <span>Daily balance</span>
                <strong>
                  {remainingTokens !== null
                    ? `${remainingTokens.toLocaleString()} daily tokens remaining`
                    : 'Waiting for the next backend balance'}
                </strong>
              </div>
            </section>
            <section className="info-dialog-section info-dialog-danger">
              <button
                type="button"
                className="dialog-danger"
                onClick={() => setClearDialogOpen(true)}
              >
                Clear chat history
              </button>
            </section>
          </div>
        </div>
      )}

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
            setInfoDialogOpen(true);
          }
          }
          className="info-btn"
          title="Chat information"
          aria-label="Open chat information"
        >
          <IoInformationCircleOutline />
        </button>
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

            function renderMessageContent(text: string, citations?: Citation[]) {
              return text.split(/(\[\d+\]|\*\*[^*\n]+\*\*)/g).map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return <strong key={i}>{part.slice(2, -2)}</strong>
                }
                const match = part.match(/\[(\d+)\]/)
                if (!match) return part
                const idx = parseInt(match[1], 10) - 1
                const citation = citations?.[idx]
                if (!citation) return part
                const href = toHttpUrl(citation, effectiveApiBase)
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
                    {m.pending ? (
                      <span className="response-loading" role="status" aria-live="polite">
                        <span className="response-spinner" aria-hidden="true" />
                        <span className="sr-only">Waiting for response</span>
                      </span>
                    ) : (
                      renderMessageContent(
                        m.text
                          // turn leading "- " into bullets
                          .replace(/^-+\s+/gm, '• ')
                          // remove stray "-" before citations or EOL
                          .replace(/\s*-\s*(?=\[\d+\]|\n|$)/g, ''),
                        deduped
                      )
                    )}

                  </div>
                  {m.who === 'ai' && deduped.length > 0 && (
                    <div className="rcb-cite" aria-label="Sources">
                      <div className="rcb-cite-label">Sources:</div>
                      <ol className="rcb-cite-list">
                        {deduped.map((citation, citationIndex) => {
                          const href = toHttpUrl(citation, effectiveApiBase)
                          const title =
                            citation.title ||
                            basenameFromUrl(citation.url) ||
                            `Source ${citationIndex + 1}`
                          return (
                            <li className="rcb-cite-item" key={`${title}-${citationIndex}`}>
                              {href ? (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  [{citationIndex + 1}] {title}
                                </a>
                              ) : (
                                <span>[{citationIndex + 1}] {title}</span>
                              )}
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  )}
                  {m.who === 'ai' && !m.pending && <div className="timestamp">{m.time}</div>}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className='question-container'>
        <div className="composer">
          {msgs.length >= 24 && (
            <div className="summary-token-notice" role="status">
              Your next message may summarize older chat and use additional daily tokens.
            </div>
          )}
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
              maxLength={queryMaxLength}
              className="chat-input"
            />
            <button
              className="send-button"
              onClick={send}
              disabled={
                busy ||
                !authToken ||
                exceedsInputTokenLimit
              }
              aria-label={busy ? 'Waiting for response' : 'Send message'}
            >
              {busy ? (
                <>
                  <span className="send-spinner" aria-hidden="true" />
                  <span className="sr-only" role="status" aria-live="polite">
                    Waiting for response
                  </span>
                </>
              ) : 'Send'}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
