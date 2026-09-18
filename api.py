import os
import json
import asyncio
import shutil
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from graph.workflow import create_workflow
from tools.file_tools import write_file, WORKSPACE_DIR

load_dotenv()

app = FastAPI(title="CodeFlow AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def clear_workspace():
    """Remove all files from workspace before each new review run.
    This prevents old test files from polluting pytest results."""
    if os.path.exists(WORKSPACE_DIR):
        shutil.rmtree(WORKSPACE_DIR)
    os.makedirs(WORKSPACE_DIR)



async def run_workflow_stream(code: str, filename: str, max_iterations: int):
    """Generator that yields SSE events from the LangGraph workflow."""
    workflow = create_workflow()
    state = {
        "original_code": code,
        "current_code": code,
        "filename": filename,
        "review_history": [],
        "patch_history": [],
        "iteration": 0,
        "max_iterations": max_iterations,
        "final_status": None,
    }

    last_value   = {}
    final_status = None
    final_code   = code

    try:
        for event in workflow.stream(state):
            await asyncio.sleep(0.01)
            for key, value in event.items():
                last_value = value  # always keep the last event value

                if key == "reviewer":
                    review_history = value.get("review_history", [])
                    if review_history:
                        latest = review_history[-1]
                        # Use the iteration from state (updated by reviewer_node)
                        iteration = value.get("iteration", len(review_history))
                        # Capture final status if approved
                        if value.get("final_status") == "APPROVED":
                            final_status = "APPROVED"
                        payload = {
                            "type": "reviewer",
                            "iteration": iteration,
                            "score": latest.score,
                            "summary": latest.summary,
                            "decision": latest.decision,
                            "issues": [
                                {
                                    "severity": i.severity,
                                    "title": i.title,
                                    "line": i.line,
                                    "description": i.description,
                                    "suggestion": getattr(i, "suggestion", None),
                                    "must_fix": i.must_fix,
                                }
                                for i in latest.issues
                            ],
                        }
                        yield f"data: {json.dumps(payload)}\n\n"

                elif key == "developer":
                    patch_history = value.get("patch_history", [])
                    if patch_history:
                        latest = patch_history[-1]
                        current_code = value.get("current_code", code)
                        final_code   = current_code  # track latest patched code
                        # Use the iteration from state (updated by reviewer_node)
                        iteration = value.get("iteration", len(patch_history))
                        payload = {
                            "type": "developer",
                            "iteration": iteration,
                            "status": latest.status,
                            "changes": latest.changes,
                            "tests": {
                                "passed": latest.tests.passed if latest.tests else 0,
                                "failed": latest.tests.failed if latest.tests else 0,
                            },
                            "current_code": current_code,
                        }
                        yield f"data: {json.dumps(payload)}\n\n"

        # ── Final done event ─────────────────────────────────────
        # Determine final status from last event or fallback
        if not final_status:
            final_status = last_value.get("final_status") or "MAX_ITERATIONS_REACHED"
        if last_value.get("current_code"):
            final_code = last_value["current_code"]

        yield f"data: {json.dumps({'type': 'done', 'final_status': final_status, 'current_code': final_code})}\n\n"

    except Exception as e:
        import traceback
        err_detail = traceback.format_exc()
        yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'detail': err_detail})}\n\n"


@app.post("/review")
async def review_code(
    code: str = Form(...),
    filename: str = Form("code_sample.py"),
    max_iterations: int = Form(3),
):
    """Stream a code review workflow as SSE."""
    if not os.getenv("GROQ_API_KEY"):
        return {"error": "GROQ_API_KEY not set"}

    if not filename or filename in ("code_file.txt", "code_file.py"):
        filename = "test_code_sample.py" if "def test_" in code else "code_sample.py"

    # Fresh workspace for each run — prevents old files from polluting test results
    clear_workspace()
    write_file(filename, code)

    return StreamingResponse(
        run_workflow_stream(code, filename, max_iterations),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/review/upload")
async def review_upload(
    file: UploadFile = File(...),
    max_iterations: int = Form(3),
):
    """Upload a file and stream review as SSE."""
    if not os.getenv("GROQ_API_KEY"):
        return {"error": "GROQ_API_KEY not set"}

    code = (await file.read()).decode("utf-8")
    filename = file.filename or ("test_code_sample.py" if "def test_" in code else "code_sample.py")

    # Fresh workspace for each run — prevents old files from polluting test results
    clear_workspace()
    write_file(filename, code)

    return StreamingResponse(
        run_workflow_stream(code, filename, max_iterations),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
def health():
    return {"status": "ok", "groq_key_set": bool(os.getenv("GROQ_API_KEY"))}
