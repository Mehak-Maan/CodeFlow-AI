# ⚡ CodeFlow AI — Autonomous Multi-Agent Code Review & Repair Engine

> **CodeFlow AI** is an autonomous multi-agent system that automatically analyzes, reviews, patches, and validates source code until it meets rigorous quality and safety standards — powered by **LangGraph**, **Groq LLM**, **FastAPI**, and **React (Vite)**.

---

## 🏗️ Architecture & How It Works

```
                    ┌──────────────────────────────┐
                    │    React Frontend (Vite)     │
                    │    http://localhost:5173      │
                    └──────────────┬───────────────┘
                                   │  Server-Sent Events (SSE)
                                   ▼
                    ┌──────────────────────────────┐
                    │      FastAPI Backend          │
                    │    http://127.0.0.1:8000      │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   LangGraph State Machine    │
                    └──────────────┬───────────────┘
                                   │
          ┌────────────────────────┴────────────────────────┐
          ▼                                                  ▼
┌──────────────────────┐                        ┌───────────────────────┐
│  Reviewer Agent (AI) │                        │  Developer Agent (AI) │
│                      │ ──── Issues Found ───▶ │                       │
│ • Analyzes code      │                        │ • Writes targeted fix │
│ • Scores quality     │ ◀─── Patched Code ──── │ • Runs unit tests     │
│ • Flags issues       │                        │ • Updates workspace   │
└──────────┬───────────┘                        └───────────────────────┘
           │
  APPROVED / Max Iterations reached
           │
           ▼
   [ Final Code Ready ]
```

### Flow Summary
1. You submit code (paste or upload a file) via the web dashboard.
2. The **Reviewer Agent** inspects it and returns a structured JSON review — bugs, severity, score, and decision.
3. If `REJECTED`, the **Developer Agent** reads the file, applies minimal targeted patches, writes/updates tests, and runs them.
4. The workflow loops back to the Reviewer until the code is `APPROVED` or the iteration limit is hit.
5. All progress streams to your browser in real time via SSE.

---

## 🧩 Core Components

### 1. Reviewer Agent — [`agents/reviewer.py`](agents/reviewer.py)
- Inspects code for bugs, logical flaws, security vulnerabilities (SQL injection, unsafe inputs, etc.), type mismatches, and edge-case errors.
- Returns a structured `ReviewResult` with a quality **score (1–10)**, issue list, and a final **decision** (`APPROVED` or `REJECTED`).
- Uses **model fallback** — tries `openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `qwen/qwen3.8-27b` for resilience.
- Temperature locked to `0.0` for deterministic, reproducible analysis.

### 2. Developer Agent — [`agents/developer.py`](agents/developer.py)
- Reads the Reviewer's issue list and the source file via tool calls.
- Applies **minimal, targeted patches** — avoids rewriting code unnecessarily.
- Writes or updates unit tests, then runs them via subprocess.
- Returns a structured `PatchResult` with changes made and test pass/fail counts.

### 3. Workflow Orchestrator — [`graph/workflow.py`](graph/workflow.py)
- Built on **LangGraph's `StateGraph`**.
- Entry point → Reviewer → conditional edge (Developer or END) → loops back to Reviewer.
- Terminates on `APPROVED` or when `iteration >= max_iterations`.

### 4. FastAPI Backend — [`api.py`](api.py)
| Endpoint | Method | Description |
|---|---|---|
| `/review` | POST | Submit code as text form field, streams SSE |
| `/review/upload` | POST | Upload a source file, streams SSE |
| `/health` | GET | Health check + API key status |

### 5. React Frontend — [`frontend/src/`](frontend/src/)
Built with **React + Vite**. Features:
- **⚡ Issues & Fixes** — per-bug explanations with severity badges.
- **🔄 Iteration Timeline** — step-by-step Reviewer ↔ Developer handoffs.
- **⚖️ Before vs After** — side-by-side diff; bugs in red, fixes in green.
- **✨ Fixed Code** — clean final code ready to copy or download.

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm**
- **Groq API Key** — free tier at [console.groq.com](https://console.groq.com/)

---

### Step 1 — Configure Environment

Copy the example env file and add your key:
```bash
cp .env.example .env
```
Then edit `.env`:
```env
GROQ_API_KEY=your_groq_api_key_here
```

---

### Step 2 — Start the Backend

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start FastAPI with live reload
python -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```
Backend is now live at → `http://127.0.0.1:8000`

---

### Step 3 — Start the Frontend

Open a **new terminal**:
```bash
cd frontend
npm install
npm run dev
```
Open your browser at → `http://localhost:5173`

---

## 📁 Project Structure

```
CodeFlow AI/
├── agents/
│   ├── prompts.py          # System prompts for Reviewer & Developer agents
│   ├── reviewer.py         # Reviewer agent — code analysis & scoring
│   └── developer.py        # Developer agent — patching & test execution
├── graph/
│   ├── state.py            # CodeFlowState — typed state schema
│   └── workflow.py         # LangGraph graph: edges, conditions, loop logic
├── schemas/
│   ├── review.py           # ReviewResult & Issue Pydantic models
│   └── patch.py            # PatchResult & TestResult Pydantic models
├── tools/
│   ├── file_tools.py       # Sandboxed workspace file read/write
│   └── test_tools.py       # Subprocess pytest runner with timeout
├── frontend/               # React (Vite) web dashboard
│   ├── src/
│   │   ├── App.jsx         # Root app component & SSE event handler
│   │   ├── InputPanel.jsx  # Code input, file upload, settings
│   │   └── DashboardPanel.jsx  # Review results, diffs, iteration timeline
│   ├── index.html
│   └── vite.config.js
├── api.py                  # FastAPI app — REST endpoints & SSE streaming
├── requirements.txt        # Python dependencies
├── .env.example            # Environment variable template
├── Dockerfile              # Backend Docker image
├── docker-compose.yml      # Full-stack Docker Compose setup
└── .gitignore
```

---

## 🐳 Docker Setup (Optional)

Run the entire stack with one command:
```bash
docker-compose up --build
```
- Backend → `http://localhost:8000`
- Frontend → `http://localhost:5173`

---

## 🛡️ Security & Reliability

| Feature | Detail |
|---|---|
| **Sandboxed File I/O** | All file operations confined to `workspace/` — prevents path traversal |
| **Deterministic LLM** | Temperature `0.0` → consistent, reproducible reviews |
| **Model Fallback** | Auto-retries across 3 Groq models if one fails |
| **Safe Test Runner** | Pytest runs in subprocess with bounded timeout |
| **Secret Protection** | `.env` excluded via `.gitignore`; `.env.example` uses placeholders only |

---

## 📦 Python Dependencies

| Package | Purpose |
|---|---|
| `langgraph` | Multi-agent state machine orchestration |
| `langchain-core` | LLM message primitives |
| `langchain-groq` | Groq LLM integration |
| `pydantic` | Data validation & schema enforcement |
| `fastapi` | REST API & SSE streaming |
| `uvicorn` | ASGI server |
| `python-multipart` | File upload support |
| `python-dotenv` | `.env` loading |
| `pytest` | Automated test runner |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push and open a Pull Request

---

## 📄 License

This project is open source. See [LICENSE](LICENSE) for details.
