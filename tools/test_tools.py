import os
import sys
import subprocess
from tools.file_tools import WORKSPACE_DIR

def run_tests(target: str = None) -> str:
    """Runs pytest in the workspace using the current venv's Python interpreter.
    When a target file is given, ONLY that file is tested — no workspace-wide scan.
    """
    try:
        if target:
            target_path = os.path.join(WORKSPACE_DIR, target)
            if not os.path.exists(target_path):
                return "NO_TESTS_COLLECTED\npytest: target file not found"
            # Run ONLY the target file — no extra scanning options
            cmd = [sys.executable, "-m", "pytest", target, "-v", "--tb=short", "--no-header", "-q"]
        else:
            # No target: scan whole workspace for test_* functions in *.py files
            cmd = [sys.executable, "-m", "pytest", ".", "-v", "--tb=short", "--no-header", "-q",
                   "-o", "python_files=*.py", "-o", "python_functions=test_*"]

        result = subprocess.run(
            cmd,
            cwd=WORKSPACE_DIR,
            capture_output=True,
            text=True,
            timeout=30
        )
        output = result.stdout + "\n" + result.stderr
        # pytest exit code 5 = no tests were collected
        if result.returncode == 5:
            output = "NO_TESTS_COLLECTED\n" + output
        return output
    except subprocess.TimeoutExpired:
        return "Error: Test execution timed out."
    except Exception as e:
        return f"Error: {str(e)}"

def run_python(filename: str) -> str:
    """Runs a Python script in the workspace using the current venv's Python interpreter."""
    try:
        path = os.path.join(WORKSPACE_DIR, filename)
        if not os.path.exists(path):
            return f"Error: File {filename} not found."

        result = subprocess.run(
            [sys.executable, filename],
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
