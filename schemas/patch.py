from pydantic import BaseModel, Field
from typing import List, Literal

class TestMetrics(BaseModel):
    passed: int
    failed: int

class PatchResult(BaseModel):
    status: Literal["PATCHED", "FAILED", "ERROR"]
    changes: List[str] = Field(..., description="A list of human-readable descriptions of the changes made.")
    tests: TestMetrics = Field(..., description="Metrics from the test suite execution.")
