from langgraph.graph import StateGraph, END
from graph.state import CodeFlowState
from agents.reviewer import reviewer_node
from agents.developer import developer_node

def should_continue(state: CodeFlowState):
    if state.get("final_status") == "APPROVED":
        return END
    
    iteration = state.get("iteration", 0)
    max_iterations = state.get("max_iterations", 3)
    
    if iteration >= max_iterations:
        state["final_status"] = "MAX_ITERATIONS_REACHED"
        return END
        
    return "developer"

def create_workflow():
    workflow = StateGraph(CodeFlowState)
    
    workflow.add_node("reviewer", reviewer_node)
    workflow.add_node("developer", developer_node)
    
    workflow.set_entry_point("reviewer")
    
    workflow.add_conditional_edges(
        "reviewer",
        should_continue,
        {
            "developer": "developer",
            END: END
        }
    )
    
    workflow.add_edge("developer", "reviewer")
    
    return workflow.compile()
