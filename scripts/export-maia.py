"""Export pinned Maia-3 5M weights to a self-contained browser ONNX model.

Requires the pinned upstream source in docs/human-practice.md, PyTorch and ONNX.
SPDX-License-Identifier: AGPL-3.0-or-later
"""
import argparse
import hashlib
from pathlib import Path
import torch
from maia3.uci import Maia3UCIEngine, parse_args

parser = argparse.ArgumentParser()
parser.add_argument("checkpoint")
parser.add_argument("output")
args = parser.parse_args()
expected = "ba14208b2992d85502f5fb501934abf6aaaeb355e9f3fdf90e326911f562524f"
if hashlib.sha256(Path(args.checkpoint).read_bytes()).hexdigest() != expected:
    raise ValueError("Unexpected Maia checkpoint")
torch.set_num_threads(1)
torch.backends.mha.set_fastpath_enabled(False)
cfg = parse_args(["--model", "5m", "--checkpoint-path", args.checkpoint,
                  "--device", "cpu", "--no-use-amp", "--use-uci-history"])
engine = Maia3UCIEngine(cfg)
engine.ensure_model_loaded()
def rms_forward(self, x):
    eps = self.eps if self.eps is not None else torch.finfo(x.dtype).eps
    return x * torch.rsqrt(x.square().mean(dim=-1, keepdim=True) + eps) * self.weight
import types
for module in engine.model.modules():
    if isinstance(module, torch.nn.RMSNorm):
        module.forward = types.MethodType(rms_forward, module)
Path(args.output).parent.mkdir(parents=True, exist_ok=True)
with torch.no_grad():
    torch.onnx.export(engine.model,
                      (torch.zeros(1, 64, 97), torch.tensor([1400]), torch.tensor([1400])),
                      args.output, input_names=["tokens", "self_elo", "opponent_elo"],
                      output_names=["policy", "wdl", "ponder"],
                      opset_version=18, dynamo=False, external_data=False)
print(hashlib.sha256(Path(args.output).read_bytes()).hexdigest())
