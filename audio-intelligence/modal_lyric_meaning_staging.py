"""Lyric meaning for MUMOO Staging: what the words MEAN, read by an open model we host ourselves.

  submit  POST  JSON {lines: [str, ...], language: "xx" | null}  ->  {"id": "fc-..."}  (instant)
  status  GET   ?id=fc-...                                       ->  202 running | 200 JSON result

Privacy: lyrics exist only in this request's memory. Nothing is logged, stored, or sent to a third party; the model
(Qwen3-8B, Apache 2.0) runs inside this Modal app and is never trained on what it reads.

The model describes the words with a few fixed fields (constrained JSON, so the answer can never be malformed).
Turning those fields into colour and motion is the brain's job, in the app, where it can be tested.
"""
from __future__ import annotations

import json
import os
import re
import time

from fastapi import HTTPException, Request, Response
import modal

APP = "mumoo-lyric-meaning-staging"
MODEL_REPO = "Qwen/Qwen3-8B"
MODEL_DIR = "/models/qwen3-8b"
MAX_LINES = 120
MAX_LINE_CHARS = 200
MAX_WORDS = 120
MIN_WORDS = 12
CALL_RE = re.compile(r"^fc-[A-Za-z0-9]{8,48}$")
LANG_RE = re.compile(r"^[a-z]{2,3}$")

ATTITUDES = [
    "joyful", "playful", "flirty", "tender", "romantic", "hopeful", "boastful", "defiant", "annoyed", "angry",
    "menacing", "bitter", "heartbroken", "lonely", "nostalgic", "reflective", "spiritual", "neutral",
]

SCHEMA = {
    "type": "object",
    "properties": {
        # Written first so the model reasons about the meaning before it picks labels.
        "gist": {"type": "string", "maxLength": 140},
        "clarity": {"type": "string", "enum": ["clear", "thin"]},
        "attitude": {"type": "string", "enum": ATTITUDES},
        # 0 = no sadness ... 3 = deep sorrow. Cocky, angry or playful words are 0.
        "sadness": {"type": "integer", "minimum": 0, "maximum": 3},
        # 1 = calm and gentle ... 5 = fierce and forceful.
        "intensity": {"type": "integer", "minimum": 1, "maximum": 5},
    },
    "required": ["gist", "clarity", "attitude", "sadness", "intensity"],
    "additionalProperties": False,
}

SYSTEM = (
    "You read song lyrics for a music-video designer. Work out what the words MEAN: who is speaking, to whom, and "
    "the attitude behind it. Look past individual words to tone, sarcasm and implication. Judge the words alone, "
    "never the beat or genre. The lyrics can be in any language and are a short excerpt of a song.\n"
    "Never guess. If the excerpt is mostly vocal sounds (ah, mm, hey), a single short phrase, or otherwise too thin to "
    "show a feeling, set clarity to thin, attitude to neutral, sadness to 0 and intensity to 3.\n"
    "Return JSON with: gist (one plain English sentence, at most 140 characters), clarity (clear or thin), attitude "
    "(the single best label), sadness (0 none to 3 deep sorrow; boasting, anger and playfulness are 0) and intensity "
    "(1 calm and gentle to 5 fierce and forceful)."
)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("vllm==0.10.2", "transformers==4.56.2", "huggingface-hub", "fastapi==0.115.12")
    .run_commands(
        f"python -c \"from huggingface_hub import snapshot_download; "
        f"snapshot_download('{MODEL_REPO}', local_dir='{MODEL_DIR}', allow_patterns=['*.json', '*.safetensors', '*.txt'])\"",
    )
)
gateway_image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi==0.115.12")
app = modal.App(APP)
secret = modal.Secret.from_name("mumoo-music-bridge")


def authorized(request: Request) -> None:
    auth = request.headers.get("authorization") or ""
    bridge = os.environ.get("MUMOO_MUSIC_BRIDGE_SECRET") or ""
    if len(bridge) < 32 or auth != f"Bearer {bridge}":
        raise HTTPException(401, "Unauthorized.")


def parse_body(body) -> tuple[list[str], str | None]:
    if not isinstance(body, dict) or not set(body) <= {"lines", "language"}:
        raise ValueError("body")
    language = body.get("language")
    if language is not None and (not isinstance(language, str) or not LANG_RE.match(language)):
        raise ValueError("language")
    lines = body.get("lines")
    if not isinstance(lines, list) or not 1 <= len(lines) <= MAX_LINES:
        raise ValueError("lines")
    clean = []
    for line in lines:
        if not isinstance(line, str) or len(line) > MAX_LINE_CHARS:
            raise ValueError("line")
        if line.strip():
            clean.append(line.strip())
    if not clean or sum(len(line.split()) for line in clean) > MAX_WORDS:
        raise ValueError("words")
    return clean, language


@app.cls(image=image, gpu="A10G", min_containers=0, max_containers=4, scaledown_window=120, timeout=280)
class Reader:
    @modal.enter()
    def load(self):
        from vllm import LLM

        self.llm = LLM(MODEL_DIR, max_model_len=2048, gpu_memory_utilization=0.9, enforce_eager=True)

    @modal.method()
    def read(self, lines: list[str], language: str | None) -> dict:
        from vllm import SamplingParams
        from vllm.sampling_params import GuidedDecodingParams

        started = time.perf_counter()
        if sum(len(line.split()) for line in lines) < MIN_WORDS:
            # Too few words to mean anything; asking the model would only invite a made-up mood.
            return {"version": 1, "gist": "", "clarity": "thin", "attitude": "neutral", "sadness": 0, "intensity": 3,
                    "seconds": 0.0}
        hint = f" (language code: {language})" if language else ""
        messages = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Lyrics{hint}:\n" + "\n".join(lines)},
        ]
        params = SamplingParams(temperature=0.0, max_tokens=220, guided_decoding=GuidedDecodingParams(json=SCHEMA))
        output = self.llm.chat(messages, params, chat_template_kwargs={"enable_thinking": False}, use_tqdm=False)
        meaning = json.loads(output[0].outputs[0].text)
        return {"version": 1, **meaning, "seconds": round(time.perf_counter() - started, 2)}


@app.function(image=gateway_image, secrets=[secret], timeout=30, scaledown_window=10)
@modal.fastapi_endpoint(method="POST", docs=False)
async def submit(request: Request):
    authorized(request)
    try:
        lines, language = parse_body(await request.json())
    except (TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(400, "Expected lyric lines and an optional language code.") from None
    call = await Reader().read.spawn.aio(lines, language)
    return {"id": call.object_id}


@app.function(image=gateway_image, secrets=[secret], timeout=30, scaledown_window=10)
@modal.fastapi_endpoint(method="GET", docs=False)
async def status(request: Request, id: str = ""):
    authorized(request)
    if not CALL_RE.match(id):
        raise HTTPException(400, "Invalid job id.")
    call = modal.FunctionCall.from_id(id)
    try:
        result = await call.get.aio(timeout=0)
    except TimeoutError:
        return Response(content=json.dumps({"status": "running"}), status_code=202,
                        media_type="application/json", headers={"Cache-Control": "no-store"})
    except modal.exception.OutputExpiredError:
        raise HTTPException(410, "This result expired. Start it again.") from None
    except Exception:  # noqa: BLE001
        raise HTTPException(502, "The lyric reading failed. Try again.") from None
    return Response(content=json.dumps(result), media_type="application/json",
                    headers={"Cache-Control": "no-store"})
