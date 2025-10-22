import React from 'react'
import App from './App'

export default function Widget({ apiBase, source, title }: { apiBase: string; source?: string; title?: string }) {
  const [open, setOpen] = React.useState(false)
  function toggle() { setOpen(v => !v) }

  return (
    <div className="rcb-widget-root" aria-live="polite">
      <button
        className={`rcb-launcher ${open ? 'open' : ''}`}
        aria-label={open ? 'Close chat' : 'Open chat'}
        onClick={toggle}
      >
        <span className="icon chat">
          <div className='chat-icon'/>
        </span>
        <span className="icon close">✕</span>
      </button>

      <div
        className={`rcb-popup ${open ? 'open' : 'closed'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Pathway Chatbot'}
      >
        <div className="rcb-popup-inner">
          <App apiBase={apiBase} source={source} title={title} />
        </div>
      </div>
    </div>
  )
}
