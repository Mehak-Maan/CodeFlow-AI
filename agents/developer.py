import os
import re
import json
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.tools import tool

from agents.prompts import DEVELOPER_PROMPT
from tools.file_tools import read_file, write_file, list_files
from tools.test_tools import run_tests, run_python
from schemas.patch import PatchResult, TestMetrics

from dotenv import load_dotenv

dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    load_dotenv()

# Real Groq-hosted models in priority order — verified available on this account
MODELS_PRIORITY = [
    ("openai/gpt-oss-120b", 8192),
    ("openai/gpt-oss-20b",  8192),
    ("qwen/qwen3.8-27b",    8192),
    ("groq/compound-mini",  4096),
]

def invoke_developer_llm_with_fallback(messages, temperature=0.0):
    last_err = None
    api_key = os.getenv("GROQ_API_KEY")
    for model_name, max_tokens in MODELS_PRIORITY:
        try:
            llm = ChatGroq(model_name=model_name, temperature=temperature, max_tokens=max_tokens, api_key=api_key)
            return llm.invoke(messages)
        except Exception as e:
            last_err = e
    raise last_err or RuntimeError("All models failed but no error was captured.")

@tool
def read_workspace_file(filename: str) -> str:
    """Reads a file from the workspace."""
    return read_file(filename)

@tool
def write_workspace_file(filename: str, content: str) -> str:
    """Writes content to a file in the workspace. Useful for patching code and writing tests."""
    return write_file(filename, content)

@tool
def list_workspace_files() -> list:
    """Lists all files in the workspace."""
    return list_files()

@tool
def run_workspace_tests() -> str:
    """Runs pytest in the workspace and returns the output. USE THIS TO VERIFY YOUR FIXES."""
    return run_tests()

@tool
def search_workspace_file(query: str) -> str:
    """Searches for files in the workspace that match the query string."""
    files = list_files()
    matching_files = [f for f in files if query.lower() in f.lower()]
    if matching_files:
        return f"Found {len(matching_files)} matching files: {', '.join(matching_files)}"
    else:
        return f"No files found matching '{query}'"

developer_tools = [
    read_workspace_file,
    write_workspace_file,
    list_workspace_files,
    run_workspace_tests,
    search_workspace_file
]

def parse_test_output(test_output: str) -> tuple[int, int]:
    """Parse pytest output to extract real passed/failed counts.
    Returns (passed, failed).
    Special case: returns (-1, 0) when no tests were collected at all.
    """
    # No tests collected — return sentinel (-1) so UI can show "No tests" instead of "0 Passed"
    if "NO_TESTS_COLLECTED" in test_output or "no tests ran" in test_output.lower():
        return -1, 0

    passed_m = re.search(r"(\d+)\s+passed", test_output, re.IGNORECASE)
    failed_m = re.search(r"(\d+)\s+failed", test_output, re.IGNORECASE)
    error_m  = re.search(r"(\d+)\s+error", test_output, re.IGNORECASE)

    if passed_m or failed_m or error_m:
        passed = int(passed_m.group(1)) if passed_m else 0
        failed = (int(failed_m.group(1)) if failed_m else 0) + (int(error_m.group(1)) if error_m else 0)
        return passed, failed

    # Count individual PASSED/FAILED markers
    if "PASSED" in test_output or "FAILED" in test_output:
        passed = test_output.count("PASSED")
        failed = test_output.count("FAILED")
        return passed, failed

    # No tests were collected — report as sentinel, do NOT fabricate
    return -1, 0

def developer_node(state: dict) -> dict:
    review_history = state.get("review_history", [])
    if not review_history:
        return state

    latest_review = review_history[-1]
    filename = state.get("filename", "code_sample.py")
    iteration = state.get("iteration", 1)

    # Read current code
    current_code = read_file(filename)

    # Build compact issue list — avoids verbose model_dump_json to save tokens
    if latest_review.issues:
        issue_lines = []
        for idx, i in enumerate(latest_review.issues, 1):
            line_info = f" (line {i.line})" if i.line else ""
            fix_info  = f"\n   Fix: {i.suggestion}" if i.suggestion else ""
            issue_lines.append(
                f"{idx}. [{i.severity}] {i.title}{line_info} — must_fix={i.must_fix}\n"
                f"   {i.description}{fix_info}"
            )
        issue_details = "\n".join(issue_lines)
        issue_summary = f"Reviewer found {len(latest_review.issues)} issue(s). Score: {latest_review.score}/10."
    else:
        issue_summary = f"Reviewer scored the code {latest_review.score}/10."
        issue_details = (
            f"Summary: {latest_review.summary}\n"
            f"Score {latest_review.score}/10 indicates problems — analyse carefully and fix ALL bugs."
        )

    prompt = f"""{DEVELOPER_PROMPT}

Reviewer Report:
{issue_summary}

Full Review Details:
{issue_details}

Current code in file '{filename}':
{current_code}

Fix ALL bugs. For EVERY fix, add a comment directly above:
# [FIXED]: <Clear short explanation of what was fixed and why>
Return ONLY the complete fixed code. No markdown fences. No extra text.
"""

    try:
        result = invoke_developer_llm_with_fallback([HumanMessage(content=prompt)], temperature=0.0)
        fixed_code = result.content.strip()

        # Strip markdown code fences if present
        if fixed_code.startswith("```"):
            lines = fixed_code.splitlines()
            # Remove opening fence line
            if lines[0].startswith("```"):
                lines = lines[1:]
            # Remove closing fence line
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            fixed_code = "\n".join(lines).strip()

        # Write the fixed code to workspace
        write_file(filename, fixed_code)

        # Run actual tests and parse results honestly
        test_output = run_tests(filename)
        passed, failed = parse_test_output(test_output)

        # Describe changes
        if latest_review.issues:
            changes_list = [
                f"Fixed: {i.title}" + (f" — {i.suggestion}" if i.suggestion else "")
                for i in latest_review.issues
            ]
        else:
            changes_list = [f"Applied general fixes based on reviewer feedback (Score: {latest_review.score}/10)"]

        patch_result = PatchResult(
            status="PATCHED",
            changes=changes_list,
            tests=TestMetrics(passed=passed, failed=failed)
        )
    except Exception as e:
        patch_result = PatchResult(
            status="ERROR",
            changes=[f"Failed to apply fixes: {str(e)}"],
            tests=TestMetrics(passed=0, failed=0)
        )

    patch_history = state.get("patch_history", [])
    patch_history.append(patch_result)

    return {
        "current_code": read_file(filename),
        "patch_history": patch_history,
        "iteration": iteration
    }
