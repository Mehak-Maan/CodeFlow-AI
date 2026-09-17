# ⚡ CodeFlow AI — Autonomous Multi-Agent Code Review & Repair Engine

**CodeFlow AI** is an autonomous multi-agent system powered by **LangGraph**, **Groq LLM (openai/gpt-oss-120b)**, **FastAPI**, and **React (Vite)**. It automatically analyzes, reviews, tests, patches, and refactors source code until it meets rigorous quality and safety standards.

---

## 🏗️ Architecture & How It Works

```
                          ┌───────────────────────────┐
                          │   React Frontend (Vite)   │
                          │   http://localhost:5173   │
                          └─────────────┬─────────────┘
                                        │ Server-Sent Events (SSE)
                                        ▼
                          ┌───────────────────────────┐
                          │      FastAPI Backend      │
                          │   http://127.0.0.1:8000   │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │    LangGraph StateMachine │
                          └─────────────┬─────────────┘
                                        │
                ┌───────────────────────┴───────────────────────┐
                ▼                                               ▼
    ┌──────────────────────┐                         ┌──────────────────────┐
    │  Reviewer Agent (AI) │                         │ Developer Agent (AI) │
    │                      │                         │                      │
    │ - Analyzes code      │ ──── Issues Detected ─> │ - Generates patches  │
    │ - Scores Quality     │                         │ - Runs unit tests    │
    │ - Enforces Safety    │ <─── Refactored Code ── │ - Updates workspace  │
    └──────────┬───────────┘                         └──────────────────────┘
               │
      Approved / Max Iterations
               │
               ▼
       [ Final Code Ready ]
```

### Core Components

1. **Reviewer Agent (`agents/reviewer.py`)**:
   - Inspects code for bugs, logical flaws, security vulnerabilities (such as SQL injection and unsafe inputs), type mismatches, and edge-case errors.
   - Evaluates quality and assigns a score (`1-10`), structured issue breakdown, and a decision (`APPROVED` or `REJECTED`).
   - Uses zero temperature (`temperature=0.0`) for reliable, deterministic analysis.

2. **Developer Agent (`agents/developer.py`)**:
   - Reads the issues reported by the Reviewer Agent.
   - Writes targeted, high-precision code fixes.
   - Runs automated test suites and validates that all identified bugs are resolved.

3. **Workflow Orchestrator (`graph/workflow.py`)**:
   - Manages state transitions and feedback loops using **LangGraph**.
   - Repeatedly iterates between Reviewer and Developer until the code is approved or the user's iteration limit is reached.

4. **FastAPI Backend Server (`api.py`)**:
   - Provides live SSE (Server-Sent Events) streaming so the frontend displays agent actions in real time.
   - Handles text submissions, file uploads, and health verification.

5. **Modern Web Dashboard (`frontend/src/`)**:
   - Built with React and Vite.
   - Features:
     - **⚡ Issues & Fixes**: Explanations of each bug detected and how it was fixed.
     - **🔄 Iteration Flow**: Step-by-step timeline of Reviewer and Developer agent handoffs.
     - **⚖️ Before vs After**: Side-by-side visual diff highlighting bugs in red and verified fixes.
     - **✨ Fixed Code**: Clean, production-ready code ready to copy, download, or reload into the editor.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm**
- **Groq API Key** (Free tier available at [console.groq.com](https://console.groq.com/))

### 1. Configure Environment Variables

Create a `.env` file in the root folder:
```env
GROQ_API_KEY=your_groq_api_key_here
```

### 2. Start the Backend Server

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Run FastAPI with Uvicorn
python -m uvicorn api:app --host 127.0.0.1 --port 8000 --reload
```
The backend API is now running at `http://127.0.0.1:8000`.

### 3. Start the Frontend Dashboard

Open a new terminal window:
```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install NPM packages
npm install

# 3. Start the Vite development server
npm run dev
```
Open your browser at `http://localhost:5173/`.

---

## 🧪 Testing & Validation

CodeFlow AI comes with a complete suite of automated unit tests:

```bash
# Run all automated tests (31/31 passing)
pytest tests/ -v

# Run the end-to-end integration test
python run_live_test.py

# Test frontend production build
cd frontend
npm run build
```

---

## 📁 Project Structure

```
Codeflow AI/
├── agents/               # AI Agents (Reviewer and Developer nodes & prompts)
│   ├── prompts.py        # System instructions for agents
│   ├── reviewer.py       # Code review & defect analysis agent
│   └── developer.py      # Code repair & test execution agent
├── graph/                # LangGraph workflow orchestration
│   ├── state.py          # State definitions & metrics schemas
│   └── workflow.py       # Conditional loops & graph edges
├── schemas/              # Pydantic data schemas for reviews & patches
├── tools/                # Safe file management & test execution tools
├── tests/                # 31 unit tests covering all components
├── sample_test_files/    # Sample programs with intentional defects
├── frontend/             # React (Vite) web dashboard application
├── api.py                # FastAPI REST API & SSE streaming endpoints
├── requirements.txt      # Python dependencies
├── pytest.ini            # Pytest configuration
└── .gitignore            # Git exclusion rules for secrets and build files
```

---

## 🛡️ Security & Reliability

- **Sandboxed File Operations**: All file read/write operations are confined to the `workspace/` directory to prevent path traversal.
- **Deterministic Responses**: LLM temperature is locked to `0.0` to ensure consistent and reproducible reviews on repeat executions.
- **Safe Test Runner**: Pytest executions run within bounded subprocess timeouts to prevent infinite loops.
