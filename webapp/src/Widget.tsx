import React from 'react'
import App from './App'
import { RiRobot2Line } from "react-icons/ri";

export default function Widget({ apiBase, source, title }: { apiBase: string; source?: string; title?: string }) {
  const CLOSED_SIZE = { width: 66, height: window.innerHeight };
  const OPEN_SIZE = { width: 450, height: window.innerHeight };

  const [open, setOpen] = React.useState(false)
  const [buttonBottom, setButtonBottom] = React.useState<number | null>(null)
  const buttonRef = React.useRef<HTMLDivElement | null>(null)
  const popupRef = React.useRef<HTMLDivElement | null>(null)

  function toggle() {
    setOpen(v => !v)
  }

  React.useEffect(() => {
    try {
      const size = open ? OPEN_SIZE : CLOSED_SIZE;
      window.parent?.postMessage(
        { type: 'RAG_WIDGET_RESIZE', ...size, open },
        '*'
      );
    } catch { }
  }, [open]);


  // send an initial size on first mount (ensure tiny on load)
  React.useEffect(() => {
    try {
      window.parent?.postMessage(
        { type: 'RAG_WIDGET_RESIZE', ...CLOSED_SIZE, open: false },
        '*'
      );
    } catch { }
  }, []);

  // Handle dragging vertically
  React.useEffect(() => {
    const root = buttonRef.current
    if (!root) return

    let startY = 0
    let startBottom = 0
    let dragging = false

    const startDrag = (e: MouseEvent) => {
      dragging = true
      startY = e.clientY
      startBottom = parseInt(getComputedStyle(root).bottom)
      document.addEventListener('mousemove', onDrag)
      document.addEventListener('mouseup', stopDrag)
    }

    const onDrag = (e: MouseEvent) => {
      if (!dragging) return
      const vh = window.innerHeight
      const delta = startY - e.clientY
      let newBottom = startBottom + delta
      const minBottom = 10
      const maxBottom = vh - 66 // ensure top 10px margin for button
      newBottom = Math.min(Math.max(newBottom, minBottom), maxBottom)
      root.style.bottom = `${newBottom}px`
      setButtonBottom(newBottom)
    }

    const stopDrag = () => {
      dragging = false
      document.removeEventListener('mousemove', onDrag)
      document.removeEventListener('mouseup', stopDrag)
    }

    root.addEventListener('mousedown', startDrag)
    return () => root.removeEventListener('mousedown', startDrag)
  }, [])

  // Synchronize popup vertical position with button
  React.useEffect(() => {
    const popup = popupRef.current
    const button = buttonRef.current
    if (!popup || !button) return

    const vh = window.innerHeight
    const popupHeight = popup.offsetHeight
    const buttonRect = button.getBoundingClientRect()
    const buttonTop = vh - (buttonBottom ?? parseInt(getComputedStyle(button).bottom)) - button.offsetHeight
    const buttonBottomY = buttonTop + button.offsetHeight
    const bottomLimit = vh - 10 // cannot exceed bottom of screen

    // Calculate popup top position
    let popupTop = buttonTop
    let popupBottomY = popupTop + popupHeight

    // if popup bottom goes off screen, pin to bottom
    if (popupBottomY > bottomLimit) {
      popupTop = vh - popupHeight - 10
    }

    popup.style.top = `${popupTop}px`
  }, [buttonBottom, open])

  return (
    <div className="rcb-widget-root" style={{ position: "fixed", top: 10, left: 10 }}>
      <div ref={buttonRef} className="rcb-launcher-wrapper">
        <button
          className={`rcb-launcher ${open ? 'open' : ''}`}
          aria-label={open ? 'Close chat' : 'Open chat'}
          onClick={toggle}
        >
          <span className="icon chat">
            {/* <div className='chat-icon' /> */}
            <RiRobot2Line />
          </span>
        </button>
      </div>

      <div
        ref={popupRef}
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
