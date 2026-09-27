"""Server-owned action registry. Increment version when changing a prompt."""
from pathlib import Path

ROOT = Path(__file__).with_name("blueprints")
VERSION = "3"
ACTIONS = {
    "ask": {"label": "Ask coach", "requires": [], "prompt": ""},
    "explain_position": {"label": "Explain position", "requires": ["board"], "prompt": "Explain this position and suggest a plan."},
    "preparation_plan": {"label": "Preparation plan", "requires": ["preparation"], "prompt": "Build a preparation plan from the selected context."},
    "repertoire": {"label": "Opponent repertoire", "requires": ["opponent"], "prompt": "Summarize the available opening evidence for this opponent."},
}


def catalog():
    return [{"id": key, "version": VERSION, **value} for key, value in ACTIONS.items()]


def system_prompt(action):
    return (ROOT / "base.md").read_text() + "\nSelected action:\n" + (ROOT / f"{action}.md").read_text() + "\n" + (ROOT / "response.md").read_text()
