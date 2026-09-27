"""The only module that knows credentials and the Cerebras transport."""
import json
import os
from pathlib import Path
import ssl
import urllib.error
import urllib.request

from .contracts import CoachError


class CerebrasProvider:
    def complete(self, messages):
        key = os.environ.get("CEREBRAS_API_KEY", "").strip()
        if not key:
            raise CoachError("Cerebras is not configured. Set CEREBRAS_API_KEY and restart the server.", 503)
        model = os.environ.get("CEREBRAS_MODEL", "gpt-oss-120b")
        request = urllib.request.Request("https://api.cerebras.ai/v1/chat/completions",
            data=json.dumps({"model": model, "max_tokens": 4096, "response_format": {"type": "json_object"}, "messages": messages}).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "ChessScope/0.1"}, method="POST")
        ca_file = next((path for path in (ssl.get_default_verify_paths().cafile, "/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt")
                        if path and Path(path).is_file()), None)
        try:
            with urllib.request.urlopen(request, timeout=60, context=ssl.create_default_context(cafile=ca_file)) as response:
                result = json.loads(response.read())
            reply = result["choices"][0]["message"]["content"]
            if not isinstance(reply, str) or not reply.strip():
                raise CoachError("The model returned no answer. Please retry.", 502)
            return {"reply": reply.strip(), "model": result.get("model") or model}
        except urllib.error.HTTPError as exc:
            # Provider error bodies may echo request data. Keep them out of UI/logs.
            raise CoachError(f"Cerebras returned HTTP {exc.code}. Check account access or retry later.", 502) from exc
        except (OSError, ValueError, KeyError, IndexError, TypeError) as exc:
            raise CoachError("Could not get an answer from Cerebras. Please retry.", 502) from exc
