//go:build js && wasm

package main

// The Tal net uses the scalar evaluator. This unreachable signature keeps
// upstream's optional multilayer AVX2 branch compilable for WebAssembly.
func getEvalMultilayerAVX2(
	a0, a1 *int16,
	l1w *int8,
	l1b, l2w, l2b, l3w *float32,
	l3b, scale float32,
	sum *int32,
) {
	panic("AVX2 is unavailable in WebAssembly")
}
