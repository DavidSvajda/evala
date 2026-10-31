# SPDX-License-Identifier: AGPL-3.0-or-later
# Maia-3 adapter. Upstream CSSLab source and license are served alongside this file.
import json
import os
import sys
import torch
from maia3.uci import Maia3UCIEngine, parse_args

torch.set_num_threads(1)
torch.set_num_interop_threads(1)
config = parse_args(["--model", "5m", "--checkpoint-path", os.environ["MAIA_MODEL"],
                     "--device", "cpu", "--no-use-amp", "--use-uci-history"])
engine = Maia3UCIEngine(config)
engine.ensure_model_loaded()
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    try:
        data = json.loads(line)
        engine.cmd_ucinewgame()
        engine.cmd_position("position fen " + data["initialFen"] + " moves " + " ".join(data["moves"]))
        engine.self_elo = data["elo"]
        engine.oppo_elo = data["elo"]
        engine.multipv = 8
        engine.temperature = 1.0
        move, candidates = engine.score_moves()
        print(json.dumps({"move": move.uci() if move else None,
                          "candidates": [{"move": item["move"].uci(), "probability": item["policy"]}
                                         for item in candidates]}), flush=True)
    except Exception:
        print(json.dumps({"error": "Maia inference failed"}), flush=True)
