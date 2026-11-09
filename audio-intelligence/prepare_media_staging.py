"""Run the staging prepare worker directly with your Modal login (no public endpoint, no secret).

Used by creative/scripts/prepare-sample.mjs to cut out a photo or prepare a video/GIF without any browser.

  python3 prepare_media_staging.py --kind photo|motion --source <https link> --puts '{"cutout": "<https link>"}'
"""
import argparse
import json

import modal

parser = argparse.ArgumentParser()
parser.add_argument("--kind", required=True, choices=["photo", "motion"])
parser.add_argument("--source", required=True)
parser.add_argument("--puts", required=True)
args = parser.parse_args()

prepare = modal.Function.from_name("mumoo-prepare-media-staging", "prepare", environment_name="mumoo-staging")
print(json.dumps(prepare.remote(args.kind, args.source, json.loads(args.puts))))
