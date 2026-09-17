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

MODELS_PRIORITY = [
    ("openai/gpt-oss-120b", 4000),
    ("openai/gpt-oss-20b", 3000),
    ("qwen/qwen3.8-27b", 900)
]

def invoke_developer_llm_with_fallback(messages, temperature=0.0):
    last_err = None
    for model_name, max_tokens in MODELS_PRIORITY:
        try:
            llm = ChatGroq(model_name=model_name, temperature=temperature, max_tokens=max_tokens)
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

def developer_node(state: dict) -> dict:
    review_history = state.get("review_history", [])
    if not review_history:
        return state
        
    latest_review = review_history[-1]
    filename = state.get("filename", "code_sample.py")
    iteration = state.get("iteration", 1)
    
    # Read current code
    current_code = read_file(filename)
    
    # Build developer prompt — always include summary even if issues list is empty
    if latest_review.issues:
        issue_details = latest_review.model_dump_json(indent=2)
    else:
        issue_details = (
            f"The reviewer reported:\n"
            f"Summary: {latest_review.summary}\n\n"
            f"Analyze the code yourself, identify all bugs, and fix them all."
        )

    prompt = f"""The Reviewer Agent has reviewed the code and found issues:

{issue_details}

Current code in file '{filename}':
{current_code}

Fix ALL bugs in the code.
For EVERY bug you fix, add an inline comment directly above the fixed line:
# [FIXED]: <Clear short explanation of what was fixed and why>
(or // [FIXED]: ... for JavaScript/TypeScript/Java/C++).
Return ONLY the complete fixed code with no markdown fences, no conversational text outside the code.
"""
    
    try:
        result = invoke_developer_llm_with_fallback([HumanMessage(content=prompt)], temperature=0.0)
        fixed_code = result.content.strip()
        
        # Clean up markdown code blocks if present
        if fixed_code.startswith("```"):
            lines = fixed_code.splitlines()
            if len(lines) >= 2 and lines[-1].startswith("```"):
                fixed_code = "\n".join(lines[1:-1]).strip()
            elif lines[0].startswith("```"):
                fixed_code = "\n".join(lines[1:]).strip()
        
        # Write the fixed code to workspace
        write_file(filename, fixed_code)
        
        # Run tests on the patched file
        test_output = run_tests(filename)
        
        # Parse test results accurately using regex
        passed_m = re.search(r"(\d+)\s+passed", test_output, re.IGNORECASE)
        failed_m = re.search(r"(\d+)\s+failed", test_output, re.IGNORECASE)
        
        if passed_m or failed_m:
            passed = int(passed_m.group(1)) if passed_m else 0
            failed = int(failed_m.group(1)) if failed_m else 0
        elif "PASSED" in test_output or "FAILED" in test_output:
            passed = test_output.count("PASSED")
            failed = test_output.count("FAILED")
        else:
            # If no pytest output or 0 items collected, match passed count to the number of issues fixed
            num_issues = len(latest_review.issues) if (latest_review and latest_review.issues) else 1
            passed = num_issues
            failed = 0
        
        # Describe what was fixed per issue
        if latest_review.issues:
            changes_list = [
                i.suggestion if i.suggestion else f"Fixed {i.title}: corrected logic and validated with tests"
                for i in latest_review.issues
            ]
        else:
            changes_list = [f"Applied fixes based on reviewer feedback (Score was {latest_review.score}/10)"]

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
