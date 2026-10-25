import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
const forbidden =
  /(^|\/)(?:\.git|\.local-data|\.azure-cli-venv|node_modules|\.env(?:\..*)?)(\/|$)|\.(?:pem|key|p12|pfx)$/i;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /GOCSPX-[A-Za-z0-9_-]{15,}/,
  /gh[pousr]_[A-Za-z0-9]{25,}/,
  /AccountKey=[A-Za-z0-9+/]{30,}=*/,
];
export function assertPublishablePath(name) {
  if (forbidden.test(name.replaceAll('\\', '/')))
    throw new Error('Private file in release: ' + name);
}
export async function assertAssetTree(root, { html = false } = {}) {
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name),
        name = relative(root, file).replaceAll('\\', '/');
      assertPublishablePath(name);
      if (entry.isSymbolicLink()) throw new Error('Symlink in release: ' + name);
      if (entry.isDirectory()) {
        await walk(file);
        continue;
      }
      if (/\.(?:js|css|html|json|txt|md)$/.test(name)) {
        const source = await readFile(file, 'utf8');
        if (secretPatterns.some((pattern) => pattern.test(source)))
          throw new Error('Credential pattern in release: ' + name);
        if (
          html &&
          name.endsWith('.html') &&
          (/<style\b/i.test(source) ||
            /\sstyle\s*=/i.test(source) ||
            /\son[a-z]+\s*=/i.test(source))
        )
          throw new Error('Inline style/event handler in ' + name);
      }
    }
  }
  await walk(root);
}
