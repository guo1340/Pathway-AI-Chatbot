import React from 'react'
import { askRag } from './api'

type Citation = { title?: string; url?: string }
type Msg = { who: 'you' | 'ai', text: string, citations?: Citation[] }

export default function App({
  apiBase,
  source,
  title
}: { apiBase: string; source?: string; title?: string }) {

  const [msgs, setMsgs] = React.useState<Msg[]>([])
  const [q, setQ] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [convId, setConvId] = React.useState<string | undefined>(undefined)
  const logRef = React.useRef<HTMLDivElement | null>(null)

  // ---- helpers (frontend-only) ----
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
    // Backend already normalizes to absolute http(s) when possible.
    if (!c.url) return undefined
    if (c.url.startsWith('http')) return c.url
    if (c.url.startsWith('/')) return c.url // same-origin relative
    // Fallback: convert file:// to /api/files
    if (c.url.startsWith('file://')) {
      const name = basenameFromUrl(c.url)
      if (name) return `${apiBase.replace(/\/$/, '')}/api/files/${encodeURIComponent(name)}`
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
  // ----------------------------------

  async function send() {
    const query = q.trim()
    if (!query || busy) return
    setQ('')
    setMsgs(m => [...m, { who: 'you', text: query }])
    setBusy(true)
    try {
      const data = await askRag(apiBase, { query, source, conversation_id: convId })
      setConvId(data.conversation_id)
      const answer = data.answer || ''
      const citations: Citation[] | undefined = data.citations

      // push placeholder AI message, then progressively type it out
      setMsgs(m => [...m, { who: 'ai', text: '', citations }])

      await new Promise<void>(resolve => {
        let i = 0
        const step = () => {
          i = Math.min(i + 2, answer.length) // typing speed
          setMsgs(m => {
            if (!m.length) return m
            const lastIdx = m.length - 1
            const last = m[lastIdx]
            if (last.who !== 'ai') return m
            const next = [...m]
            next[lastIdx] = { ...last, text: answer.slice(0, i) }
            return next
          })
          if (i < answer.length) {
            setTimeout(step, 16)
          } else {
            resolve()
          }
        }
        setTimeout(step, 16)
      })
    } catch (e: any) {
      setMsgs(m => [...m, { who: 'ai', text: `Error: ${e.message}` }])
    }
    setBusy(false)
  }

  // auto-scroll to bottom on new messages
  React.useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  return (
    <div className="rcb-card" role="complementary" aria-label="RAG Chatbot">
      <div className="rcb-head">{title || 'Ask our AI'}</div>
      <div className="rcb-log" id="rcb-log" ref={logRef}>
        {msgs.map((m, i) => {
          const deduped = dedupeCitations(m.citations)
          return (
            <div key={i} className={`rcb-msg ${m.who}`}>
              <div><strong>{m.who === 'you' ? 'You' : 'AI'}</strong>: {m.text}</div>
              {!!deduped.length && (
                <div className="rcb-cite" aria-label="Sources">
                  <div className="rcb-cite-label">Sources:</div>
                  <ol className="rcb-cite-list">
                    {deduped.map((c, j) => {
                      const fileName = basenameFromUrl(c.url) || c.title || 'source'
                      const href = toHttpUrl(c, apiBase)
                      const num = j + 1
                      return (
                        <li key={j} className="rcb-cite-item">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={fileName}               // tooltip on hover
                            >
                              [{num}] {fileName}
                            </a>
                          ) : (
                            <span>[{num}] {fileName}</span>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="rcb-row">
        <textarea
          placeholder="Ask about our docs, posts, or PDFs…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
        />
        <button onClick={send} disabled={busy}>{busy ? 'Thinking…' : 'Send'}</button>
      </div>
    </div>
  )
}
