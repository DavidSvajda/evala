/** Errors deliberately safe to return to a client. SDK/runtime errors stay private. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const httpError = (status, message) => new HttpError(status, message);

export function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

export function sendError(res, error, fallback = 'Požadavek se nepodařilo dokončit.') {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const known = error instanceof HttpError;
  if (!known)
    console.error(
      'Evala request failed:',
      String(error?.code || error?.name || 'Error').slice(0, 64),
    );
  res.setHeader('Connection', 'close');
  json(res, known ? error.status : 500, { error: known ? error.message : fallback });
}

export async function readJsonBody(req, { limit = 65536, requireContentType = true } = {}) {
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')
    throw httpError(415, 'Compressed request bodies are not supported.');
  if (
    requireContentType &&
    String(req.headers['content-type'] || '')
      .split(';')[0]
      .trim()
      .toLowerCase() !== 'application/json'
  ) {
    throw httpError(415, 'Požadavek musí být JSON.');
  }
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    throw httpError(413, 'Požadavek je příliš velký.');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > limit) {
      req.resume();
      throw httpError(413, 'Požadavek je příliš velký.');
    }
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw httpError(400, 'Neplatný požadavek JSON.');
  }
}
