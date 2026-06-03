import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

function mount() {
  const rootEl = document.getElementById('rag-chatbot-root')
  if (!rootEl) return

  // From WP shortcode attributes:
  const source = rootEl.getAttribute('data-source') || undefined
  const title = rootEl.getAttribute('data-title') || undefined

  // From WP (wp_localize_script) or standalone index.html shim
  const cfg = (window as any).RAG_CHATBOT_CONFIG || {}
  const apiBase: string = cfg.apiBase || 'https://api.chat.pathway.training'
  // const apiBase: string = cfg.apiBase || 'http://localhost:8000'

  createRoot(rootEl).render(
    <App apiBase={apiBase} source={source} title={title || 'Pathway Chatbot (Beta)'} />
  )
}

mount()
