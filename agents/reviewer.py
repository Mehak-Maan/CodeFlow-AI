import os
import json
import re
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from schemas.review import ReviewResult, Issue
from agents.prompts import REVIEWER_PROMPT

MODELS_PRIORITY = [
    ("openai/gpt-oss-120b", 4000),
    ("openai/gpt-oss-20b", 3000),
    ("qwen/qwen3.8-27b", 900)
]

def invoke_llm_with_fallback(messages, temperature=0.0):
    last_err = None
    for model_name, max_tokens in MODELS_PRIORITY:
        try:
            llm = ChatGroq(model_name=model_name, temperature=temperature, max_tokens=max_tokens)
            return llm.invoke(messages)
        except Exception as e:
            last_err = e
    raise last_err or RuntimeError("No models available in MODELS_PRIORITY")

def parse_review_response(content: str) -> ReviewResult:
    cleaned = content.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[1].split("```")[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0].strip()
    
    # 1. Direct JSON parse
    try:
        data = json.loads(cleaned)
        return ReviewResult(**data)
    except Exception:
        pass

    # 2. Extract substring between first { and last }
    if "{" in cleaned and "}" in cleaned:
        sub = cleaned[cleaned.find("{"):cleaned.rfind("}")+1]
        try:
            data = json.loads(sub)
            return ReviewResult(**data)
        except Exception:
            pass

    # 3. Regex extract each issue block with title, line, description, suggestion
    issues = []
    blocks = re.findall(r'\{[^{}]*"severity"[^{}]*\}', content, re.DOTALL)
    for b in blocks:
        try:
            data = json.loads(b)
            issues.append(Issue(**data))
        except Exception:
            sev_m = re.search(r'"severity"\s*:\s*"([^"]+)"', b)
            title_m = re.search(r'"title"\s*:\s*"([^"]+)"', b)
            line_m = re.search(r'"line"\s*:\s*(\d+)', b)
            desc_m = re.search(r'"description"\s*:\s*"([^"]+)"', b)
            sugg_m = re.search(r'"suggestion"\s*:\s*"([^"]+)"', b)
            if sev_m and desc_m:
                issues.append(Issue(
                    severity=sev_m.group(1),
                    title=title_m.group(1) if title_m else "Code Defect",
                    line=int(line_m.group(1)) if line_m else None,
                    description=desc_m.group(1),
                    suggestion=sugg_m.group(1) if sugg_m else None,
                    must_fix=True
                ))
    
    is_approved = "APPROVED" in content.upper() and len(issues) == 0
    return ReviewResult(
        decision="APPROVED" if is_approved else "REJECTED",
        summary="Automated code review completed.",
        score=9 if is_approved else 4,
        issues=issues
    )

def reviewer_node(state: dict) -> dict:
    code = state.get("current_code", "")
    
    messages = [
        SystemMessage(content=REVIEWER_PROMPT),
        HumanMessage(content=(
            f"Please review the following code:\n\n```\n{code}\n```\n\n"
            "IMPORTANT: Return ONLY a single valid JSON object. No markdown fences. No explanation text before or after.\n"
            "Required JSON format:\n"
            '{\n'
            '  "decision": "APPROVED" or "REJECTED",\n'
            '  "summary": "Clear summary of the code quality and security findings",\n'
            '  "score": 1-10,\n'
            '  "issues": [\n'
            '    {\n'
            '      "severity": "CRITICAL" or "HIGH" or "MEDIUM" or "LOW",\n'
            '      "title": "Clear descriptive title of the bug",\n'
            '      "line": integer line number,\n'
            '      "description": "What is broken and why it fails",\n'
            '      "suggestion": "Exact fix applied to solve the bug",\n'
            '      "must_fix": true\n'
            '    }\n'
            '  ]\n'
            '}'
        ))
    ]
    
    try:
        result = invoke_llm_with_fallback(messages, temperature=0.0)
        result_obj = parse_review_response(result.content)
    except Exception as e:
        result_obj = ReviewResult(
            decision="REJECTED",
            summary=f"Review failed due to error: {str(e)}",
            score=1,
            issues=[]
        )
    
    review_history = state.get("review_history", [])
    review_history.append(result_obj)
    
    # Increment iteration counter after each review
    iteration = state.get("iteration", 0) + 1
    
    return {
        "review_history": review_history,
        "final_status": result_obj.decision if result_obj.decision == "APPROVED" else None,
        "iteration": iteration
    }
