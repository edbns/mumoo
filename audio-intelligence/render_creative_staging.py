"""Render one creative on the deployed staging worker, calling it directly with your Modal login.

Used by creative/scripts/cloud-render.mjs for Dust, Riso, Window and Our photography, which need a person's photo (the public
endpoint only hands over a photo for a signed-in person). Nothing here touches the laptop's GPU or CPU.

  python3 render_creative_staging.py --wav clip.wav --opts opts.json [--photo photo.jpg] [--cutout cutout.png | --motion clip.mp4] --out out.mp4
"""
import argparse
import json
from pathlib import Path

import modal

parser = argparse.ArgumentParser()
parser.add_argument("--wav", required=True)
parser.add_argument("--opts", required=True)
parser.add_argument("--photo")
parser.add_argument("--cutout")
parser.add_argument("--motion")
parser.add_argument("--out", required=True)
args = parser.parse_args()

render = modal.Function.from_name("mumoo-creatives-encode-staging", "render_job", environment_name="mumoo-staging")
media = {name: Path(path).read_bytes() for name, path in (("photo", args.photo), ("cutout", args.cutout), ("motion", args.motion)) if path}
mp4 = render.remote(Path(args.wav).read_bytes(), json.loads(Path(args.opts).read_text()), media)
Path(args.out).write_bytes(mp4)
