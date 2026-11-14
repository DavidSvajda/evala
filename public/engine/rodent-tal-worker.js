// UCI bridge for the locally bundled Rodent V Tal NNUE WebAssembly build.
importScripts('./rodent-wasm-exec.js');

const pending = [];
const originalLog = console.log;
console.log = (...parts) => {
  const output = parts.join(' ');
  for (const line of output.split('\n')) if (line) postMessage(line);
};

onmessage = ({ data }) => {
  if (typeof data !== 'string') return;
  if (typeof globalThis.rodentCommand === 'function') globalThis.rodentCommand(data);
  else pending.push(data);
};

(async () => {
  try {
    const response = await fetch('./rodent-tal.wasm');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const go = new Go();
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
    go.run(instance).catch((error) => postMessage(`CRITICAL ERROR: ${error.message}`));
    const ready = setInterval(() => {
      if (typeof globalThis.rodentCommand !== 'function') return;
      clearInterval(ready);
      for (const command of pending.splice(0)) globalThis.rodentCommand(command);
    }, 10);
  } catch (error) {
    originalLog('Rodent V failed to load:', error);
    postMessage(`CRITICAL ERROR: Rodent V failed to load: ${error.message}`);
  }
})();
