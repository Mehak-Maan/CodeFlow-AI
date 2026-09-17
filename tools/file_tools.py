import os
from typing import List

WORKSPACE_DIR = os.path.join(os.getcwd(), "workspace")

def _ensure_workspace():
    if not os.path.exists(WORKSPACE_DIR):
        os.makedirs(WORKSPACE_DIR)

def get_safe_path(filename: str) -> str:
    _ensure_workspace()
    safe_path = os.path.abspath(os.path.join(WORKSPACE_DIR, filename))
    if not safe_path.startswith(WORKSPACE_DIR):
        raise ValueError(f"Access denied. Path {filename} is outside the workspace.")
    return safe_path

def read_file(filename: str) -> str:
    """Reads a file from the workspace."""
    path = get_safe_path(filename)
    if not os.path.exists(path):
        return f"Error: File {filename} does not exist."
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def write_file(filename: str, content: str) -> str:
    """Writes content to a file in the workspace."""
    path = get_safe_path(filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Successfully wrote to {filename}"

def list_files() -> List[str]:
    """Lists all files in the workspace."""
    _ensure_workspace()
    files = []
    for root, _, filenames in os.walk(WORKSPACE_DIR):
        for f in filenames:
            rel_dir = os.path.relpath(root, WORKSPACE_DIR)
            if rel_dir == ".":
                files.append(f)
            else:
                files.append(os.path.join(rel_dir, f))
    return files
