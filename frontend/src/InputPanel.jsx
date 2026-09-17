import { useState, useRef, useEffect } from 'react'

// ── Language definitions ─────────────────────────────────────────────────────
const LANG_MAP = {
  py:   { label: 'Python',     icon: '🐍', mime: 'text/x-python',     comment: '#'  },
  js:   { label: 'JavaScript', icon: '🟨', mime: 'text/javascript',    comment: '//' },
  ts:   { label: 'TypeScript', icon: '🔷', mime: 'text/typescript',    comment: '//' },
  jsx:  { label: 'JSX',        icon: '⚛️',  mime: 'text/javascript',    comment: '//' },
  tsx:  { label: 'TSX',        icon: '⚛️',  mime: 'text/typescript',    comment: '//' },
  java: { label: 'Java',       icon: '☕', mime: 'text/x-java',        comment: '//' },
  cpp:  { label: 'C++',        icon: '⚙️',  mime: 'text/x-c++src',     comment: '//' },
  c:    { label: 'C',          icon: '🔧', mime: 'text/x-csrc',        comment: '//' },
  cs:   { label: 'C#',         icon: '🟣', mime: 'text/x-csharp',      comment: '//' },
  go:   { label: 'Go',         icon: '🔵', mime: 'text/x-go',          comment: '//' },
  rb:   { label: 'Ruby',       icon: '💎', mime: 'text/x-ruby',        comment: '#'  },
  php:  { label: 'PHP',        icon: '🐘', mime: 'text/x-php',         comment: '//' },
  rs:   { label: 'Rust',       icon: '🦀', mime: 'text/x-rustsrc',     comment: '//' },
  txt:  { label: 'Text',       icon: '📄', mime: 'text/plain',          comment: '#'  },
}

function detectLang(fname) {
  const ext = fname?.split('.').pop()?.toLowerCase()
  return LANG_MAP[ext] || LANG_MAP.txt
}

// ── Samples for multiple languages ─────────────────────────────────────────
const SAMPLES = {
  py_math: {
    name: 'calculator.py',
    label: '🐍 Math Bugs',
    desc: 'Division by zero, swapped exponent args, average returns sum',
    code: `"""Math utilities — deliberate bugs"""

def divide(a: float, b: float) -> float:
    # BUG: crashes on zero divisor
    return a / b

def power(base: float, exp: float) -> float:
    # BUG: swapped args — returns exp**base not base**exp
    return exp ** base

def calculate_average(numbers: list) -> float:
    # BUG 1: returns sum, not average
    # BUG 2: crashes on empty list
    total = 0
    for n in numbers:
        total += n
    return total


# Pytest Suite
def test_divide():
    assert divide(10, 2) == 5.0
    assert divide(5, 0) == 0.0

def test_power():
    assert power(2, 3) == 8.0
    assert power(5, 2) == 25.0

def test_calculate_average():
    assert calculate_average([10, 20, 30]) == 20.0
    assert calculate_average([]) == 0.0
`,
  },
  py_security: {
    name: 'user_manager.py',
    label: '🐍 Security Bugs',
    desc: 'SQL injection, mutable default arg, weak password check',
    code: `"""User manager — security vulnerabilities"""

def add_role(user: dict, role: str, roles_list: list = []) -> list:
    # BUG: mutable default arg leaks between calls
    roles_list.append(role)
    user["roles"] = roles_list
    return roles_list

def validate_password(password: str) -> bool:
    # BUG: len >= 0 is always True — accepts empty passwords
    if len(password) >= 0:
        return True
    return False

def build_user_query(username: str) -> str:
    # BUG: SQL injection vulnerability
    return f"SELECT * FROM users WHERE username = '{username}'"


def test_add_role_isolation():
    u1, u2 = {"name": "Alice"}, {"name": "Bob"}
    add_role(u1, "admin")
    roles_bob = add_role(u2, "editor")
    assert roles_bob == ["editor"]

def test_validate_password():
    assert validate_password("strongPass123") is True
    assert validate_password("") is False
`,
  },
  js_bugs: {
    name: 'utils.js',
    label: '🟨 JavaScript',
    desc: 'Type coercion, loose equality, missing null checks',
    code: `// Utility functions — deliberate JavaScript bugs

// BUG: uses == instead of === (type coercion issue)
function isEqual(a, b) {
  return a == b;
}

// BUG: doesn't handle null/undefined input
function getLength(str) {
  return str.length;
}

// BUG: parseInt without radix — octal interpretation risk
function parseNumber(str) {
  return parseInt(str);
}

// BUG: mutates the original array instead of returning a new one
function addItem(arr, item) {
  arr.push(item);
  return arr;
}

// BUG: async function not properly awaited — race condition
async function fetchUser(id) {
  const response = fetch('/api/users/' + id);
  return response.json();
}

module.exports = { isEqual, getLength, parseNumber, addItem, fetchUser };
`,
  },
  java_bugs: {
    name: 'Calculator.java',
    label: '☕ Java Logic',
    desc: 'NullPointerException, integer division, unchecked null',
    code: `public class Calculator {

    // BUG: integer division loses decimal — result always 0 for small nums
    public static double divide(int a, int b) {
        return a / b;
    }

    // BUG: no null check — NullPointerException risk
    public static int getStringLength(String s) {
        return s.length();
    }

    // BUG: comparing strings with == not .equals()
    public static boolean isHello(String s) {
        return s == "hello";
    }

    // BUG: off-by-one — misses last element
    public static int sumArray(int[] arr) {
        int sum = 0;
        for (int i = 0; i < arr.length - 1; i++) {
            sum += arr[i];
        }
        return sum;
    }
}
`,
  },
  ts_bugs: {
    name: 'api.ts',
    label: '🔷 TypeScript',
    desc: 'any types, missing error handling, wrong type assertions',
    code: `// API helper — TypeScript bugs

// BUG: using 'any' defeats TypeScript type safety
function processData(data: any): any {
  return data.value;
}

// BUG: no error handling on async/await
async function fetchUser(id: number): Promise<any> {
  const response = await fetch('/api/users/' + id);
  const data = await response.json();
  return data;
}

// BUG: type assertion without guard — runtime crash if wrong type
function getUserName(user: unknown): string {
  return (user as { name: string }).name;
}

// BUG: mutating readonly-intended array param
function addToList(items: string[], newItem: string): string[] {
  items.push(newItem);
  return items;
}

export { processData, fetchUser, getUserName, addToList };
`,
  },
}

export default function InputPanel({
  onStart, onStop, isRunning, backendStatus, injectedCode,
}) {
  const [code, setCode]         = useState('')
  const [filename, setFilename] = useState('')
  const [maxIter, setMaxIter]   = useState(3)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError]       = useState('')
  const [toast, setToast]       = useState('')
  const [activeSample, setActiveSample] = useState(null)

  const fileRef     = useRef(null)
  const textareaRef = useRef(null)
  const gutterRef   = useRef(null)

  // Receive fixed code from dashboard "Load to Editor"
  useEffect(() => {
    if (injectedCode?.code) {
      setCode(injectedCode.code)
      setFilename(injectedCode.filename || 'fixed_code.py')
      setActiveSample(null)
      showToast(`✨ Fixed code loaded — ${(injectedCode.filename || 'file')}`)
    }
  }, [injectedCode])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const syncScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  const loadSample = (key) => {
    const s = SAMPLES[key]
    if (!s) return
    setCode(s.code.trim())
    setFilename(s.name)
    setActiveSample(key)
    setError('')
    showToast(`Loaded: ${s.label}`)
  }

  const handleFile = (file) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    const allowed = Object.keys(LANG_MAP)
    if (ext && !allowed.includes(ext)) {
      setError(`File type ".${ext}" is not supported. Supported: ${allowed.map(e => '.'+e).join(', ')}`)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target.result
      setCode(content)
      setFilename(file.name)
      setActiveSample(null)
      setError('')
      const lang = detectLang(file.name)
      showToast(`${lang.icon} Loaded: ${file.name} (${content.split('\n').length} lines)`)
    }
    reader.onerror = () => setError('Failed to read file. Please try again.')
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleLaunch = () => {
    if (!code.trim()) {
      setError('Paste your code below, upload a file, or pick a demo sample above.')
      return
    }
    setError('')
    onStart({ code, filename: filename || 'script.py', maxIterations: maxIter })
  }

  const lang  = detectLang(filename)
  const lines = code ? code.split('\n') : ['']

  return (
    <div
      className="input-card"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
      onDrop={handleDrop}
    >
      <input
        ref={fileRef}
        type="file"
        accept={Object.keys(LANG_MAP).map(e => '.' + e).join(',')}
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])}
      />

      {/* Toast */}
      {toast && <div className="input-toast">{toast}</div>}

      {/* Drag overlay */}
      {dragOver && (
        <div className="drag-overlay">
          <div className="drag-modal">
            <div className="drag-icon">📥</div>
            <strong>Drop your file here</strong>
            <p>Supports Python, JavaScript, TypeScript, Java, C++, Go &amp; more</p>
          </div>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────── */}
      <div className="input-header">
        <div className="input-file-tab">
          <span className="lang-icon" title={lang.label}>{lang.icon}</span>
          <input
            type="text"
            className="filename-input"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="script.py"
            title="Filename (determines language)"
            disabled={isRunning}
          />
          {filename && <span className="lang-tag">{lang.label}</span>}
        </div>
        <div className="input-header-actions">
          <button
            className="hdr-btn upload-btn"
            onClick={() => fileRef.current.click()}
            disabled={isRunning}
            title="Upload any code file from your computer"
          >
            📂 Upload File
          </button>
          {code && !isRunning && (
            <button className="hdr-btn clear-btn" onClick={() => { setCode(''); setFilename(''); setActiveSample(null) }}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Backend alerts */}
      {backendStatus === 'offline' && (
        <div className="input-alert warning">
          ⚠️ <strong>Backend offline.</strong> Run: <code>python -m uvicorn api:app --reload</code>
        </div>
      )}
      {backendStatus === 'no-key' && (
        <div className="input-alert error">
          ⚠️ <strong>GROQ_API_KEY missing</strong> — add it to your <code>.env</code> file.
        </div>
      )}

      {/* ── DEMO STRIP ──────────────────────────────────── */}
      <div className="demo-bar">
        <span className="demo-label">DEMO:</span>
        <div className="demo-chips-scroll">
          {Object.entries(SAMPLES).map(([key, s]) => (
            <button
              key={key}
              className={`demo-chip ${activeSample === key ? 'active' : ''}`}
              onClick={() => loadSample(key)}
              disabled={isRunning}
              title={s.desc}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CODE EDITOR ─────────────────────────────────── */}
      <div className="editor-wrap">
        <div className="line-gutter" ref={gutterRef} aria-hidden="true">
          {lines.map((_, i) => (
            <div key={i} className="gutter-ln">{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="code-area"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              if (!isRunning && backendStatus !== 'offline') handleLaunch()
            }
          }}
          onScroll={syncScroll}
          placeholder={`// Paste your code here, or pick a demo above…\n// Supports Python, JavaScript, TypeScript, Java, C++, Go, Ruby, PHP, Rust…\n\nfunction divide(a, b) {\n  return a / b; // BUG: no zero check\n}`}
          spellCheck={false}
          disabled={isRunning}
        />
      </div>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <div className="input-footer">
        <div className="footer-top">
          <span className="stat-txt">
            {code
              ? `${lines.length} lines · ${code.length} chars`
              : <em>Paste code, upload a file, or pick a demo above</em>
            }
          </span>
          <div className="iter-row">
            <span className="iter-label">Fix cycles:</span>
            <input
              type="range"
              className="iter-slider"
              min={1} max={5} value={maxIter}
              onChange={(e) => setMaxIter(Number(e.target.value))}
              disabled={isRunning}
            />
            <span className="iter-val">{maxIter}</span>
          </div>
        </div>

        {error && <div className="input-error-box">⚠️ {error}</div>}

        <div className="launch-row">
          <button
            className={`launch-btn ${isRunning ? 'running' : ''}`}
            onClick={handleLaunch}
            disabled={isRunning || backendStatus === 'offline'}
            title="Press Ctrl+Enter or Cmd+Enter to run"
          >
            {isRunning
              ? <><span className="spin" /> Agents Working…</>
              : <><span>🚀 RUN WORKFLOW</span> <span className="launch-kbd">⌘↵</span></>}
          </button>
          {isRunning && (
            <button className="stop-btn" onClick={onStop}>⏹ Stop</button>
          )}
        </div>
      </div>
    </div>
  )
}
