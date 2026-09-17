import os
import subprocess
from tools.file_tools import WORKSPACE_DIR

def run_tests(target: str = None) -> str:
    """Runs pytest in the workspace, optionally targeting a specific test file."""
    try:
        cmd = ["pytest", "-v", "-o", "python_files=*.py", "-o", "python_functions=test_*"]
        if target:
            target_path = os.path.join(WORKSPACE_DIR, target)
            if os.path.exists(target_path):
                cmd.append(target)
        result = subprocess.run(
            cmd,
            cwd=WORKSPACE_DIR,
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.stdout + "\n" + result.stderr
    except subprocess.TimeoutExpired:
        return "Error: Test execution timed out."
    except Exception as e:
        return f"Error: {str(e)}"

def run_python(filename: str) -> str:
    """Runs a Python script in the workspace."""
    try:
        path = os.path.join(WORKSPACE_DIR, filename)
        if not os.path.exists(path):
            return f"Error: File {filename} not found."
            
        result = subprocess.run(
            ["python", filename],
            cwd=WORKSPACE_DIR,
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.stdout + "\n" + result.stderr
    except subprocess.TimeoutExpired:
        return "Error: Execution timed out."
    except Exception as e:
        return f"Error: {str(e)}"
