from pydantic import BaseModel, Field
from typing import List, Literal, Optional

class Issue(BaseModel):
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
    category: Optional[Literal["BUG", "SECURITY", "PERFORMANCE", "STYLE", "MAINTAINABILITY", "TESTING"]] = "BUG"
    file: Optional[str] = Field(default=None, description="The path of the file where the issue was found.")
    line: Optional[int] = Field(default=None, description="The line number where the issue occurs.")
    title: str = Field(..., description="A short title for the issue.")
    description: str = Field(..., description="A detailed explanation of the issue.")
    suggestion: Optional[str] = Field(default=None, description="A suggested fix or improvement.")
    must_fix: bool = Field(default=True, description="Whether this issue must be fixed before the code is approved.")

class ReviewResult(BaseModel):
    decision: Literal["APPROVED", "REJECTED"]
    issues: List[Issue] = Field(default_factory=list, description="A list of identified issues.")
    summary: str = Field(..., description="A general summary of the review.")
    score: int = Field(..., ge=1, le=10, description="An overall code quality score from 1 to 10.")
