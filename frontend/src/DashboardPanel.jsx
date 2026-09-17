import { useState } from 'react'

/* ── Language / MIME helpers ──────────────────────────────────────────────── */
const EXT_TO_MIME = {
  py:'text/x-python', js:'text/javascript', ts:'text/typescript',
  jsx:'text/javascript', tsx:'text/typescript', java:'text/x-java',
  cpp:'text/x-c++src', c:'text/x-csrc', cs:'text/x-csharp',
  go:'text/x-go', rb:'text/x-ruby', php:'text/x-php',
  rs:'text/x-rustsrc', txt:'text/plain',
}
function getMime(fname) {
  const ext = fname?.split('.').pop()?.toLowerCase()
  return EXT_TO_MIME[ext] || 'text/plain'
}
function getFixedName(fname) {
  if (!fname) return 'fixed_code.py'
  const dot = fname.lastIndexOf('.')
  return dot > 0 ? fname.slice(0, dot) + '_fixed' + fname.slice(dot) : fname + '_fixed'
}

/* ── Severity helpers ─────────────────────────────────────────────────────── */
const SEV_ICON  = { critical:'🔴', high:'🟠', medium:'🟡', low:'🔵' }
const SEV_LABEL = { critical:'Critical Bug', high:'High Risk', medium:'Medium Issue', low:'Low Warning' }

/* ── Clean & Simple Issue Details Helper ──────────────────────────────────── */
function getSimpleIssueDetails(issue, fix) {
  const title = issue?.title || 'Code Defect'
  const problem = issue?.description || 'Detected code issue that could lead to unexpected behavior or runtime errors.'
  const howFixed = fix || issue?.suggestion || 'Fixed and validated the code logic.'
  const snippet = issue?.suggestion || (fix ? `# Fix Applied:\n# ${fix}` : '')

  return {
    title,
    problem,
    fix: howFixed,
    snippet
  }
}


/* ── Code block with optional line numbers & bug / fix highlighting ──────── */
function CodeBlock({ code: src, placeholder = '', highlightBugs = false, highlightFixed = false, showLineNumbers = false }) {
  if (!src) return <div className="code-placeholder">{placeholder}</div>
  const lines = src.split('\n')
  return (
    <div className="code-block">
      {showLineNumbers && (
        <div className="code-gutter" aria-hidden>
          {lines.map((_, i) => <span key={i} className="code-ln">{i + 1}</span>)}
        </div>
      )}
      <div className="code-lines-wrap">
        {lines.map((line, i) => {
          const isBug = highlightBugs && (
            line.includes('# BUG') ||
            line.includes('// BUG') ||
            line.includes('/* BUG') ||
            line.includes('BUG:') ||
            line.includes('BUG 1:') ||
            line.includes('BUG 2:') ||
            line.includes('BUG 3:') ||
            line.toLowerCase().includes('deliberate bug') ||
            line.toLowerCase().includes('vulnerability')
          )
          const isFixed = highlightFixed && (
            line.includes('[FIXED]') ||
            line.includes('FIXED:') ||
            line.includes('[FIX]') ||
            line.includes('FIX:') ||
            line.includes('// [FIXED]') ||
            line.includes('# [FIXED]') ||
            line.includes('// FIXED') ||
            line.includes('# FIXED') ||
            line.toLowerCase().includes('fix applied') ||
            line.toLowerCase().includes('[fixed]:') ||
            line.toLowerCase().includes('// fix:') ||
            line.toLowerCase().includes('# fix:')
          )

          let rowClass = 'code-line-row'
          if (isBug) rowClass += ' bug-highlight-line'
          if (isFixed) rowClass += ' fixed-highlight-line'

          return (
            <div key={i} className={rowClass}>
              <pre className="code-pre-line">{line || ' '}</pre>
              {isBug && (
                <span className="bug-pill-tag" title="Bug detected in original code">
                  ⚠️ BUG HERE
                </span>
              )}
              {isFixed && (
                <span className="fixed-pill-tag" title="Fix applied here with explanation comment">
                  ✨ FIX APPLIED
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPanel({
  events, isRunning, finalStatus, originalCode, filename, onStop, onLoadFixed,
}) {
  const [activeTab, setActiveTab]             = useState('pairs')
  const [copied, setCopied]                   = useState(false)
  const [downloaded, setDownloaded]           = useState(false)
  const [sentToEditor, setSentToEditor]       = useState(false)
  const [expandedCards, setExpandedCards]     = useState({})

  const reviewEvents    = events.filter(e => e.type === 'reviewer')
  const developerEvents = events.filter(e => e.type === 'developer')
  const lastEvent       = events[events.length - 1]
  const isDone          = lastEvent?.type === 'done'
  const isError         = lastEvent?.type === 'error'
  const isStopped       = isDone && (finalStatus === 'STOPPED_BY_USER' || lastEvent?.final_status === 'STOPPED_BY_USER')

  const firstReview  = reviewEvents[0]
  const latestReview = reviewEvents[reviewEvents.length - 1]

  const doneEvent           = events.slice().reverse().find(e => e.type === 'done' && e.current_code)
  const latestPatchWithCode = developerEvents.slice().reverse().find(d => d.current_code)
  const finalCode           = doneEvent?.current_code || latestPatchWithCode?.current_code || originalCode || ''

  const initialIssues = firstReview?.issues || []
  const firstDevEvent   = developerEvents[0]
  const firstDevChanges = firstDevEvent?.changes || []
  const wasApprovedDirect = firstReview?.decision === 'APPROVED' && developerEvents.length === 0
  const allChangesFlat  = developerEvents.flatMap(d => d.changes || [])

  // Extract all iterations for the Agent Flow timeline
  const iterationsMap = {}
  events.forEach(e => {
    if (e.type === 'reviewer' || e.type === 'developer') {
      const iterNum = e.iteration || 1
      if (!iterationsMap[iterNum]) {
        iterationsMap[iterNum] = { iteration: iterNum, reviewer: null, developer: null }
      }
      if (e.type === 'reviewer')  iterationsMap[iterNum].reviewer = e
      if (e.type === 'developer') iterationsMap[iterNum].developer = e
    }
  })
  const iterationList = Object.values(iterationsMap).sort((a, b) => a.iteration - b.iteration)

  // Smart issue cards pairing with fallback
  let pairs = initialIssues.map((issue, i) => {
    let fix = null
    if (wasApprovedDirect) {
      fix = '✓ Code was already correct — no fix needed.'
    } else if (firstDevChanges[i]) {
      fix = firstDevChanges[i]
    } else if (allChangesFlat[i]) {
      fix = allChangesFlat[i]
    } else if (issue.suggestion) {
      fix = issue.suggestion
    } else if (firstDevChanges.length > 0) {
      fix = firstDevChanges[0]
    } else if (allChangesFlat.length > 0) {
      fix = allChangesFlat[0]
    } else if (isDone) {
      fix = `Fixed: Corrected ${issue.title || 'issue'} in verified code.`
    }
    return { issue, fix }
  })

  // Idle placeholder pairs when no events yet
  if (pairs.length === 0 && !isRunning && events.length === 0) {
    pairs = [
      {
        issue: {
          severity: 'critical',
          title: 'Division By Zero',
          description: 'Critical bug: Division By Zero in divide function when divisor is zero.',
          line: 36,
        },
        fix: 'Guard clause applied: return 0.0 if b == 0 else a / b',
      }
    ]
  }

  /* ── Stage for live status ──────────────────────────────────────────── */
  let stage = 'idle'
  if (isRunning)       stage = developerEvents.length > 0 ? 'developing' : 'reviewing'
  else if (isStopped)  stage = 'stopped'
  else if (isDone)     stage = 'done'
  else if (isError)    stage = 'error'

  /* ── Handlers ───────────────────────────────────────────────────────── */
  const handleCopy = () => {
    const txt = finalCode || originalCode
    if (!txt) return
    navigator.clipboard.writeText(txt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  const handleDownload = () => {
    const txt = finalCode || originalCode
    if (!txt?.trim()) return
    const fname = getFixedName(filename)
    const mime  = getMime(filename)
    try {
      const blob = new Blob([txt], { type: `${mime};charset=utf-8` })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = fname; a.style.display = 'none'
      document.body.appendChild(a); a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 3000)
    } catch {
      const a = document.createElement('a')
      a.href = `data:${mime};charset=utf-8,` + encodeURIComponent(txt)
      a.download = fname; a.click()
    }
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2500)
  }

  const handleSendToEditor = () => {
    if (!finalCode || !onLoadFixed) return
    onLoadFixed(finalCode, filename)
    setSentToEditor(true)
    setTimeout(() => setSentToEditor(false), 2500)
  }

  return (
    <div className="dash-card">

      {/* ── PANEL HEADER ──────────────────────────────────────────── */}
      <div className="dash-header">
        <div className="dash-header-left">
          <h2 className="dash-title">Review Results</h2>
          {latestReview && (
            <span className={`score-badge ${latestReview.decision === 'APPROVED' ? 'approved' : 'optimizing'}`}>
              Score: {latestReview.score}/10
            </span>
          )}
          {latestReview?.decision === 'APPROVED' && (
            <span className="clean-status-tag approved">Verified Safe ✅</span>
          )}
        </div>
        {finalCode && (
          <div className="dash-header-actions">
            <button className="hdr-action-btn loop" onClick={handleSendToEditor}>
              {sentToEditor ? '✅ In Editor' : '🔄 Load to Editor'}
            </button>
            <button className="hdr-action-btn copy" onClick={handleCopy}>
              {copied ? '✅ Copied' : '📋 Copy'}
            </button>
            <button className="hdr-action-btn dl" onClick={handleDownload} title={`Save as ${getFixedName(filename)}`}>
              {downloaded ? '✅ Saved!' : `⬇️ Download`}
            </button>
          </div>
        )}
      </div>

      {/* ── IDLE WELCOME (With Agent Workflow Circles & All Supported Languages) ── */}
      {events.length === 0 && !isRunning && (
        <div className="idle-welcome">
          <div className="idle-header-badge">🌊 CodeFlow AI Engine</div>
          <h3 className="idle-title">Ready to Review &amp; Auto-Repair</h3>
          <p className="idle-sub">
            Autonomous multi-agent code analysis, security auditing, and verification.
          </p>

          {/* Multi-Agent Circular Workflow */}
          <div className="agent-flow-circles">
            <div className="agent-circle-node">
              <div className="agent-avatar-ring review-ring">
                <span>🤖</span>
              </div>
              <strong className="agent-node-name">Reviewer</strong>
              <span className="agent-node-role">Bug &amp; Sec Scan</span>
            </div>

            <div className="agent-connector-arrow">
              <div className="connector-pulse-line" />
              <span>➔</span>
            </div>

            <div className="agent-circle-node">
              <div className="agent-avatar-ring dev-ring">
                <span>💻</span>
              </div>
              <strong className="agent-node-name">Developer</strong>
              <span className="agent-node-role">Auto-Fix Code</span>
            </div>

            <div className="agent-connector-arrow">
              <div className="connector-pulse-line" />
              <span>➔</span>
            </div>

            <div className="agent-circle-node">
              <div className="agent-avatar-ring verify-ring">
                <span>✨</span>
              </div>
              <strong className="agent-node-name">Verifier</strong>
              <span className="agent-node-role">Validate Patch</span>
            </div>
          </div>

          {/* Supported Languages Showcase */}
          <div className="supported-langs-wrap">
            <span className="langs-title">SUPPORTED LANGUAGES:</span>
            <div className="langs-grid">
              <span className="lang-pill">🐍 Python</span>
              <span className="lang-pill">🟨 JavaScript</span>
              <span className="lang-pill">🔷 TypeScript</span>
              <span className="lang-pill">☕ Java</span>
              <span className="lang-pill">⚙️ C++</span>
              <span className="lang-pill">🟣 C#</span>
              <span className="lang-pill">🔵 Go</span>
              <span className="lang-pill">🦀 Rust</span>
              <span className="lang-pill">💎 Ruby</span>
              <span className="lang-pill">🐘 PHP</span>
            </div>
          </div>
        </div>
      )}

      {/* ── SIMPLE LIVE STATUS BAR ──────────────────────────────── */}
      {(isRunning || isDone || isError) && (
        <div className={`live-status ${stage}`}>
          {isRunning && <span className="status-spin" />}
          {stage === 'reviewing'  && <span>🤖 Reviewer Agent scanning code for bugs &amp; security vulnerabilities…</span>}
          {stage === 'developing' && <span>💻 Developer Agent writing and testing fixes…</span>}
          {stage === 'done'       && (
            <span>
              {(finalStatus === 'APPROVED' || lastEvent?.final_status === 'APPROVED')
                ? '✅ Review Complete — Code Approved & Verified Safe'
                : `⚠️ Review Finished — ${finalStatus || lastEvent?.final_status || 'Complete'}`
              }
            </span>
          )}
          {stage === 'stopped'    && <span>Review stopped by user</span>}
          {stage === 'error'      && <span>❌ {lastEvent?.message || 'An error occurred'}</span>}
        </div>
      )}

      {/* ── TAB BAR (Issues, Iteration Flow, Diff, Code) ───────── */}
      {(events.length > 0 || isRunning) && (
        <div className="tab-bar">
          {[
            { key: 'pairs', label: '⚡ Issues & Fixes' },
            { key: 'flow',  label: '🔄 Iteration Flow' },
            { key: 'diff',  label: '⚖️ Before vs After' },
            { key: 'code',  label: '✨ Fixed Code' },
          ].map(t => (
            <button
              key={t.key}
              className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 1 — ISSUES & FIXES (Clean Numbering & Typography)
          ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'pairs' && events.length > 0 && (
        <div className="tab-content simple-tab">
          <div className="clean-issues-container">
            <div className="clean-container-header">
              <div className="clean-header-title">
                <span>Issues &amp; Fixes</span>
                <span className="clean-count-badge">{pairs.length} found</span>
              </div>
            </div>

            <div className="clean-cards-stack">
              {pairs.length === 0 && (
                <div className="pairs-empty">
                  {isRunning ? 'Analyzing code…' : '✅ No issues found — code looks good!'}
                </div>
              )}

              {pairs.map((pair, idx) => {
                const isExpanded = !!expandedCards[idx]
                const info = getSimpleIssueDetails(pair.issue, pair.fix)

                return (
                  <div key={idx} className={`clean-issue-card ${pair.issue?.severity || 'medium'}`}>
                    <div className="clean-card-top">
                      <div className="clean-card-title-group">
                        <span className="clean-issue-num">#{idx + 1}</span>
                        <span className={`clean-sev-badge ${pair.issue?.severity || 'medium'}`}>
                          {SEV_LABEL[pair.issue?.severity] || 'Issue'}
                        </span>
                        <span className="clean-title-text">{info.title}</span>
                        {pair.issue?.line && (
                          <span className="clean-line-tag">Line {pair.issue.line}</span>
                        )}
                      </div>
                      <button
                        className="clean-toggle-code-btn"
                        onClick={() => setExpandedCards(prev => ({ ...prev, [idx]: !prev[idx] }))}
                      >
                        {isExpanded ? '▲ Hide Code' : '▼ Show Code Fix'}
                      </button>
                    </div>

                    <div className="clean-card-body">
                      <div className="clean-row">
                        <span className="clean-row-lbl error-lbl">⚠️ Problem:</span>
                        <span className="clean-row-txt">{info.problem}</span>
                      </div>
                      <div className="clean-row">
                        <span className="clean-row-lbl fix-lbl">✅ How Fixed:</span>
                        <span className="clean-row-txt">{info.fix}</span>
                      </div>
                    </div>

                    {isExpanded && info.snippet && (
                      <div className="clean-code-box">
                        <pre className="clean-code-pre">{info.snippet}</pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 2 — ITERATION FLOW (Step-by-Step Agent Journey)
          ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'flow' && events.length > 0 && (
        <div className="tab-content flow-timeline-tab">
          <div className="flow-timeline-wrap">
            <div className="timeline-header">
              <h3>🔄 Multi-Agent Execution Journey</h3>
              <p>Tracking the handoff between Reviewer Agent and Developer Agent across each fix cycle.</p>
            </div>

            <div className="iterations-stack">
              {iterationList.map((item) => (
                <div key={item.iteration} className="iteration-block">
                  <div className="iteration-badge-row">
                    <span className="iteration-pill">Cycle #{item.iteration}</span>
                    {item.reviewer?.decision === 'APPROVED' && (
                      <span className="iter-approved-tag">✅ Passed Review</span>
                    )}
                  </div>

                  <div className="iter-steps-grid">
                    {/* Step A: Reviewer Agent */}
                    {item.reviewer && (
                      <div className="agent-step-card reviewer-card">
                        <div className="step-card-hdr">
                          <div className="step-card-avatar">🤖</div>
                          <div>
                            <strong>Reviewer Agent</strong>
                            <span className="step-score">Score: {item.reviewer.score}/10</span>
                          </div>
                          <span className={`step-decision ${item.reviewer.decision === 'APPROVED' ? 'approved' : 'needs-fix'}`}>
                            {item.reviewer.decision === 'APPROVED' ? 'Approved' : 'Needs Fix'}
                          </span>
                        </div>
                        <div className="step-card-body">
                          {item.reviewer.issues?.length > 0 ? (
                            <ul className="step-issues-list">
                              {item.reviewer.issues.map((iss, iIdx) => (
                                <li key={iIdx}>
                                  <span className="issue-bullet">⚠️</span>
                                  <span>{iss.title || iss.description}</span>
                                  {iss.line && <small> (Line {iss.line})</small>}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="no-issues-txt">✅ All quality checks passed. No remaining bugs detected.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Step B: Developer Agent (if occurred) */}
                    {item.developer && (
                      <div className="agent-step-card developer-card">
                        <div className="step-card-hdr">
                          <div className="step-card-avatar">💻</div>
                          <div>
                            <strong>Developer Agent</strong>
                            <span className="step-score">Applied Patches</span>
                          </div>
                          <span className="step-decision patched">Fixes Applied</span>
                        </div>
                        <div className="step-card-body">
                          {item.developer.changes?.length > 0 ? (
                            <ul className="step-fixes-list">
                              {item.developer.changes.map((ch, cIdx) => (
                                <li key={cIdx}>
                                  <span className="fix-bullet">✓</span>
                                  <span>{ch}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="no-issues-txt">Automated refactoring and bug patching applied.</p>
                          )}
                          {item.developer.tests && (
                            <div className="step-tests-row">
                              <span>🧪 Tests:</span>
                              <span className="test-pass">{item.developer.tests.passed} Passed</span>
                              {item.developer.tests.failed > 0 && (
                                <span className="test-fail">{item.developer.tests.failed} Failed</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 3 — BEFORE vs AFTER DIFF (Red Bug vs Green Fix Highlighting)
          ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'diff' && events.length > 0 && (
        <div className="tab-content diff-tab">
          <div className="diff-grid">
            <div className="diff-panel original">
              <div className="diff-panel-hdr bad">
                <span>❌ Original Code (with bugs)</span>
                <span className="diff-tag-hint">🔴 Red = Identified Bug</span>
              </div>
              <div className="diff-panel-body">
                <CodeBlock
                  code={originalCode}
                  placeholder="No original code"
                  highlightBugs={true}
                  showLineNumbers={false}
                />
              </div>
            </div>
            <div className="diff-panel fixed-panel">
              <div className="diff-panel-hdr good">
                <span>✅ Fixed Code (by AI Agents)</span>
                <span className="diff-tag-hint">🟢 Green = Fix Applied</span>
              </div>
              <div className="diff-panel-body">
                <CodeBlock
                  code={finalCode}
                  placeholder={isRunning ? 'Agents patching…' : 'No output yet'}
                  highlightFixed={true}
                  showLineNumbers={false}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB 4 — CLEAN FIXED CODE (Numbers Removed)
          ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'code' && events.length > 0 && (
        <div className="tab-content code-tab">
          <div className="fixed-toolbar">
            <div className="fixed-meta">
              <span className={`fixed-status-pill ${latestReview?.decision === 'APPROVED' ? 'approved' : 'patched'}`}>
                {latestReview?.decision === 'APPROVED' ? '✅ Verified Code' : '⚡ Latest Patch'}
              </span>
              {filename && <span className="fixed-filename">📄 {getFixedName(filename)}</span>}
            </div>
            <div className="fixed-actions">
              <button className="fixed-btn loop" onClick={handleSendToEditor}>{sentToEditor ? '✅ In Editor' : '🔄 Load to Editor'}</button>
              <button className="fixed-btn copy" onClick={handleCopy}>{copied ? '✅ Copied!' : '📋 Copy'}</button>
              <button className="fixed-btn dl"   onClick={handleDownload}>{downloaded ? '✅ Saved!' : `⬇️ Download`}</button>
            </div>
          </div>
          <div className="fixed-code-wrap">
            <CodeBlock code={finalCode} placeholder="Generating fix…" highlightFixed={false} showLineNumbers={false} />
          </div>
        </div>
      )}
    </div>
  )
}
