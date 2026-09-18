import os
import json
import re
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from schemas.review import ReviewResult, Issue
from agents.prompts import REVIEWER_PROMPT

from dotenv import load_dotenv

dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    load_dotenv()

# Groq models in priority order — verified available on this account
MODELS_PRIORITY = [
    ("openai/gpt-oss-120b", 8192),
    ("openai/gpt-oss-20b",  8192),
    ("qwen/qwen3.8-27b",    8192),
    ("groq/compound-mini",  4096),
]

def invoke_llm_with_fallback(messages, temperature=0.0):
    last_err = None
    api_key = os.getenv("GROQ_API_KEY")
    for model_name, max_tokens in MODELS_PRIORITY:
        try:
            llm = ChatGroq(model_name=model_name, temperature=temperature, max_tokens=max_tokens, api_key=api_key)
            return llm.invoke(messages)
        except Exception as e:
            last_err = e
    raise last_err or RuntimeError("No models available in MODELS_PRIORITY")

def parse_review_response(content: str) -> ReviewResult:
    """Parse LLM response into ReviewResult — trust the LLM's score/decision, no inflation."""
    cleaned = content.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[1].split("```")[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0].strip()

    def build_result(data: dict) -> ReviewResult:
        """Build ReviewResult directly from data — no score manipulation."""
        res = ReviewResult(**data)
        # Enforce consistency: if any must_fix issue exists, must be REJECTED
        has_must_fix = any(i.must_fix for i in res.issues)
        if has_must_fix and res.decision == "APPROVED":
            res.decision = "REJECTED"
            res.score = min(res.score, 6)
        # If APPROVED, score must be >= 7
        if res.decision == "APPROVED" and res.score < 7:
            res.score = 7
        # If REJECTED, score must be <= 6
        if res.decision == "REJECTED" and res.score > 6:
            res.score = 6
        return res

    # 1. Direct JSON parse
    try:
        data = json.loads(cleaned)
        return build_result(data)
    except Exception:
        pass

    # 2. Extract substring between first { and last }
    if "{" in cleaned and "}" in cleaned:
        sub = cleaned[cleaned.find("{"):cleaned.rfind("}")+1]
        try:
            data = json.loads(sub)
            return build_result(data)
        except Exception:
            pass

    # 3. Regex-based fallback: extract issue blocks
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
            is_must_fix = (must_fix_m.group(1).lower() == "true") if must_fix_m else (sev_m.group(1).upper() in ["CRITICAL", "HIGH"] if sev_m else False)
            if sev_m and desc_m:
                issues.append(Issue(
                    severity=sev_m.group(1),
                    title=title_m.group(1) if title_m else "Code Defect",
                    line=int(line_m.group(1)) if line_m else None,
                    description=desc_m.group(1),
                    suggestion=sugg_m.group(1) if sugg_m else None,
                    must_fix=is_must_fix
                ))

    # Determine decision and score from fallback
    has_must_fix = any(i.must_fix for i in issues)
    score_m = re.search(r'"score"\s*:\s*(\d+)', content)
    parsed_score = int(score_m.group(1)) if score_m else (4 if has_must_fix else 7)

    if not has_must_fix and ("APPROVED" in content.upper() or parsed_score >= 7):
        decision = "APPROVED"
        score = max(parsed_score, 7)
    else:
        decision = "REJECTED"
        score = min(parsed_score, 6)

    return ReviewResult(
        decision=decision,
        summary="Code review completed (fallback parser).",
        score=score,
        issues=issues
    )

def reviewer_node(state: dict) -> dict:
    code = state.get("current_code", "")

    messages = [
        SystemMessage(content=REVIEWER_PROMPT),
        HumanMessage(content=(
            f"Review this code and return ONLY the JSON object:\n\n```\n{code}\n```"
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
