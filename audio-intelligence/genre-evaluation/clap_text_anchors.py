"""Zero-shot genre anchors for the sound print brain: the prompts of `anchors.json`, embedded by the same CLAP checkpoint as
the sound prints, averaged per lane into one unit vector each, and written for the site (`creative/netlify/lib/genre-anchors.mjs`).

Run from `audio-intelligence`:
  python3 -m modal run -e mumoo-staging genre-evaluation/clap_text_anchors.py --embeddings <prompts.json>
embeds the prompts in the cloud (only the prompts are sent, no audio), keeps them in <prompts.json> and writes the anchors;
  python3 genre-evaluation/clap_text_anchors.py <prompts.json>
writes the anchors again from embeddings kept before, with nothing sent anywhere.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ANCHORS = HERE.parent.parent / "creative" / "netlify" / "lib" / "genre-anchors.mjs"
sys.path.insert(0, str(HERE.parent))


def prompts_of(lanes):
    return [prompt for lane in lanes for prompt in lane["prompts"]]


def write_anchors(embeddings: dict):
    import numpy as np
    from sound_print import MODEL
    spec = json.loads((HERE / "anchors.json").read_text())
    lanes = []
    for lane in spec["lanes"]:
        mean = np.mean([embeddings[prompt] for prompt in lane["prompts"]], axis=0)
        vector = mean / np.linalg.norm(mean)
        lanes.append({key: lane[key] for key in ("id", "style", "genre", "subGenre")} | {"vector": [round(float(x), 5) for x in vector]})
    body = json.dumps({"version": 1, "model": MODEL, "lanes": lanes}, separators=(",", ":"))
    ANCHORS.write_text("// Written by audio-intelligence/genre-evaluation/clap_text_anchors.py from anchors.json; do not edit.\n"
                       f"export default {body};\n")
    print(f"{len(lanes)} anchors written to {ANCHORS}")


if __name__ == "__main__":
    write_anchors(json.loads(Path(sys.argv[1]).read_text()))
else:
    import modal
    from modal_sound_print_staging import CHECKPOINT, worker_image

    app = modal.App("mumoo-clap-text-anchors")
    image = worker_image.add_local_python_source("modal_sound_print_staging")

    # The worker's own 2 CPUs and 3 GB stall the text half; this one-off job is given room.
    @app.function(image=image, cpu=(4, 4), memory=(8192, 8192), timeout=900, max_containers=1, retries=0)
    def embed(prompts: list[str]) -> list[list[float]]:
        import laion_clap
        import numpy as np
        import torch
        torch.set_num_threads(4)
        model = laion_clap.CLAP_Module(enable_fusion=False, amodel="HTSAT-base")
        model.load_ckpt(CHECKPOINT, verbose=False)
        rows = []
        for start in range(0, len(prompts), 32):
            with torch.no_grad():
                rows.extend(np.asarray(model.get_text_embedding(prompts[start:start + 32], use_tensor=False), dtype=np.float64))
            print(f"embedded {len(rows)} of {len(prompts)}", flush=True)
        rows = np.stack(rows)
        rows = rows / np.linalg.norm(rows, axis=1, keepdims=True)
        return [[round(float(x), 6) for x in row] for row in rows]

    @app.local_entrypoint()
    def main(embeddings: str):
        prompts = prompts_of(json.loads((HERE / "anchors.json").read_text())["lanes"])
        kept = dict(zip(prompts, embed.remote(prompts)))
        Path(embeddings).write_text(json.dumps(kept))
        write_anchors(kept)
