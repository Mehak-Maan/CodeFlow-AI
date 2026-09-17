import { useState, useRef, useEffect } from 'react'
import './index.css'
import InputPanel from './InputPanel'
import DashboardPanel from './DashboardPanel'

const API_BASE = 'http://localhost:8000'

export default function App() {
  const [events, setEvents]             = useState([])
  const [isRunning, setIsRunning]       = useState(false)
  const [finalStatus, setFinalStatus]   = useState(null)
  const [originalCode, setOriginalCode] = useState('')
  const [currentFilename, setCurrentFilename] = useState('')
  const [backendStatus, setBackendStatus] = useState('checking')
  const [injectedCode, setInjectedCode] = useState(null)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('codeflow_theme') || 'dark'
  })
  const readerRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('codeflow_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  const checkBackend = async () => {
    if (isRunning) {
      setBackendStatus('online')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const data = await res.json()
        setBackendStatus(data.groq_key_set === false ? 'no-key' : 'online')
      } else {
        setBackendStatus('offline')
      }
    } catch {
      if (!isRunning) {
        setBackendStatus('offline')
      }
    }
  }

  useEffect(() => {
    checkBackend()
    const timer = setInterval(checkBackend, 15000)
    return () => clearInterval(timer)
  }, [isRunning])

  const handleStop = async () => {
    if (readerRef.current) {
      try { await readerRef.current.cancel() } catch {}
      readerRef.current = null
    }
    setIsRunning(false)
    setEvents(prev => [...prev, { type: 'done', final_status: 'STOPPED_BY_USER' }])
  }

  const handleStart = async ({ code, filename, maxIterations }) => {
    setEvents([])
    setFinalStatus(null)
    setOriginalCode(code)
    setCurrentFilename(filename || 'code_sample.py')
    setIsRunning(true)

    const formData = new FormData()
    formData.append('code', code)
    formData.append('filename', filename || 'code_sample.py')
    formData.append('max_iterations', maxIterations)

    try {
      const response = await fetch(`${API_BASE}/review`, { method: 'POST', body: formData })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        setEvents(prev => [...prev, { type: 'error', message: err.error || 'Server error' }])
        setIsRunning(false)
        return
      }

      const reader = response.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6))
              setEvents(prev => [...prev, payload])
              if (payload.type === 'done') {
                setFinalStatus(payload.final_status)
                setIsRunning(false)
              } else if (payload.type === 'error') {
                setIsRunning(false)
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setEvents(prev => [
          ...prev,
          { type: 'error', message: `Cannot reach API: ${err.message}` },
        ])
      }
      setIsRunning(false)
    }
  }

  const handleLoadFixed = (fixedCode, fname) => {
    setInjectedCode({ code: fixedCode, filename: fname || 'fixed_code.py', ts: Date.now() })
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-logo">🌊</span>
          <div>
            <h1 className="header-title">CodeFlow AI</h1>
            <p className="header-sub">Multi-Agent Code Review &amp; Auto-Repair</p>
          </div>
        </div>
        <div className="header-right">
          <div
            className={`backend-dot-badge ${backendStatus}`}
            onClick={checkBackend}
            title="Click to refresh connection status"
          >
            <span className="dot" />
            {backendStatus === 'online'   && 'AI Agents Online'}
            {backendStatus === 'no-key'   && 'GROQ Key Missing'}
            {backendStatus === 'offline'  && 'Backend Offline'}
            {backendStatus === 'checking' && 'Connecting…'}
          </div>
          <span className="header-badge">🤖 Multi-Agent · LangGraph</span>
          {/* ── SMOOTH DAY / NIGHT THEME TOGGLE ── */}
          <button
            className={`theme-toggle-btn ${theme}`}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Day Mode ☀️' : 'Switch to Night Mode 🌙'}
            aria-label="Toggle Day and Night Theme"
          >
            <div className="theme-toggle-track">
              <div className="theme-toggle-thumb">
                {theme === 'dark' ? '🌙' : '☀️'}
              </div>
            </div>
            <span className="theme-label-txt">{theme === 'dark' ? 'Night' : 'Day'}</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="ws-panel ws-left">
          <InputPanel
            onStart={handleStart}
            onStop={handleStop}
            isRunning={isRunning}
            backendStatus={backendStatus}
            injectedCode={injectedCode}
          />
        </section>
        <section className="ws-panel ws-right">
          <DashboardPanel
            events={events}
            isRunning={isRunning}
            finalStatus={finalStatus}
            originalCode={originalCode}
            filename={currentFilename}
            onStop={handleStop}
            onLoadFixed={handleLoadFixed}
          />
        </section>
      </main>
    </div>
  )
}
