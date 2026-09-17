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
    
    def create_result(data: dict) -> ReviewResult:
        res = ReviewResult(**data)
        has_critical = any(i.must_fix or i.severity in ["CRITICAL", "HIGH"] for i in res.issues)
        if not has_critical and (res.score >= 8 or len(res.issues) == 0):
            res.decision = "APPROVED"
            res.score = max(res.score, 9)
        return res

    # 1. Direct JSON parse
    try:
        data = json.loads(cleaned)
        return create_result(data)
    except Exception:
        pass

    # 2. Extract substring between first { and last }
    if "{" in cleaned and "}" in cleaned:
        sub = cleaned[cleaned.find("{"):cleaned.rfind("}")+1]
        try:
            data = json.loads(sub)
            return create_result(data)
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
            must_fix_m = re.search(r'"must_fix"\s*:\s*(true|false)', b, re.IGNORECASE)
            is_must_fix = (must_fix_m.group(1).lower() == "true") if must_fix_m else (sev_m.group(1).upper() in ["CRITICAL", "HIGH"])
            if sev_m and desc_m:
                issues.append(Issue(
                    severity=sev_m.group(1),
                    title=title_m.group(1) if title_m else "Code Defect",
                    line=int(line_m.group(1)) if line_m else None,
                    description=desc_m.group(1),
                    suggestion=sugg_m.group(1) if sugg_m else None,
                    must_fix=is_must_fix
                ))
    
    # Check if there are any critical/breaking issues
    has_critical_bugs = any(i.must_fix or i.severity in ["CRITICAL", "HIGH"] for i in issues)
    
    # Extract decision and score from content if possible
    score_m = re.search(r'"score"\s*:\s*(\d+)', content)
    parsed_score = int(score_m.group(1)) if score_m else (9 if not has_critical_bugs else 4)
    
    if not has_critical_bugs and ("APPROVED" in content.upper() or parsed_score >= 8 or len(issues) == 0):
        decision = "APPROVED"
        score = max(parsed_score, 9)
    else:
        decision = "REJECTED"
        score = min(parsed_score, 6)

    return ReviewResult(
        decision=decision,
        summary="Automated code review completed.",
        score=score,
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
            '  "summary": "Clear summary of the code quality and findings",\n'
            '  "score": integer 1-10,\n'
            '  "issues": [\n'
            '    {\n'
            '      "severity": "CRITICAL" or "HIGH" or "MEDIUM" or "LOW" or "INFO",\n'
            '      "title": "Clear descriptive title of the bug",\n'
            '      "line": integer line number or null,\n'
            '      "description": "What is broken and why it fails",\n'
            '      "suggestion": "Exact fix applied to solve the bug",\n'
            '      "must_fix": true or false\n'
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
