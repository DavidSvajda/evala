//go:build !js || !wasm

package main

import (
	"bufio"
	"os"
)

var nativeScanner = bufio.NewScanner(os.Stdin)

func nextCommand() (string, bool) {
	if !nativeScanner.Scan() {
		return "", false
	}
	return nativeScanner.Text(), true
}
