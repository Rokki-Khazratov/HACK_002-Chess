"""Prompt assembly is independent of HTTP and the model provider."""
import json

from .blueprints import ACTIONS, system_prompt


def messages_for(request, history):
    messages = [{"role": "system", "content": system_prompt(request["action"])}]
    # Retain full old anchors: an earlier question may refer to another position.
    for turn in history[-6:]:
        context = turn["context"]
        anchor = {key: context[key] for key in ("board", "preparation", "gameId", "boardSource") if key in context}
        messages.append({"role": "user", "content": json.dumps({"previousContext": anchor,
            "action": turn["action"], "message": turn["message"] or ACTIONS[turn["action"]]["prompt"]}, ensure_ascii=False)})
        messages.append({"role": "assistant", "content": turn["reply"][:16000]})
    messages.append({"role": "user", "content": json.dumps({"currentContext": request["context"],
        "action": request["action"], "message": request["message"] or ACTIONS[request["action"]]["prompt"]}, ensure_ascii=False)})
    return messages
