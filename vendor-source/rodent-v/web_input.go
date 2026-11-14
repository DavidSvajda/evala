//go:build js && wasm

package main

import "syscall/js"

var webCommands = make(chan string, 64)
var webCommandCallback js.Func

func init() {
	webCommandCallback = js.FuncOf(func(_ js.Value, args []js.Value) any {
		if len(args) == 1 && args[0].Type() == js.TypeString {
			select {
			case webCommands <- args[0].String():
			default:
				js.Global().Call("postMessage", "info string Rodent command queue full")
			}
		}
		return nil
	})
	js.Global().Set("rodentCommand", webCommandCallback)
}

func nextCommand() (string, bool) {
	return <-webCommands, true
}
