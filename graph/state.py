from typing import TypedDict, List, Optional
from schemas.review import ReviewResult
from schemas.patch import PatchResult

class CodeFlowState(TypedDict):
    original_code: str
    current_code: str
    filename: str
    review_history: List[ReviewResult]
    patch_history: List[PatchResult]
    iteration: int
    max_iterations: int
    final_status: Optional[str]  # "APPROVED", "REJECTED", "MAX_ITERATIONS_REACHED"
    error: Optional[str]
