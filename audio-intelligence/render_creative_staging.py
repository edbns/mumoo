"""Render one creative on the deployed staging worker, calling it directly with your Modal login.

Used by creative/scripts/cloud-render.mjs for Dust and Filter, which need a person's photo (the public
endpoint only hands over a photo for a signed-in person). Nothing here touches the laptop's GPU or CPU.

  python3 render_creative_staging.py --wav clip.wav --opts opts.json [--photo photo.jpg] --out out.mp4
"""
import argparse
import json
from pathlib import Path

import modal

parser = argparse.ArgumentParser()
parser.add_argument("--wav", required=True)
parser.add_argument("--opts", required=True)
parser.add_argument("--photo")
parser.add_argument("--out", required=True)
args = parser.parse_args()

render = modal.Function.from_name("mumoo-creatives-encode-staging", "render_job", environment_name="mumoo-staging")
photo = Path(args.photo).read_bytes() if args.photo else None
mp4 = render.remote(Path(args.wav).read_bytes(), json.loads(Path(args.opts).read_text()), photo)
Path(args.out).write_bytes(mp4)
