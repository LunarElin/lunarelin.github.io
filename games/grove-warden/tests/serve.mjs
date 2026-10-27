import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const port = Number(process.argv[2] || 8765);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('1024~65535 사이의 포트를 지정하세요.');
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'application/javascript', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (urlPath.split('/').some(segment => segment.startsWith('.') || segment === 'node_modules')) throw new Error('hidden');
    let filename = path.resolve(root, `.${urlPath}`);
    if (!filename.startsWith(path.resolve(root) + path.sep) && filename !== path.resolve(root)) throw new Error('outside');
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    const info = await stat(filename);
    if (!info.isFile()) throw new Error('not file');
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filename).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `포트 ${port}가 사용 중입니다. 기존 서버를 확인하거나 다른 포트를 지정하세요.` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`숲의 수호자: http://127.0.0.1:${port}/games/grove-warden/`));
process.on('SIGINT', () => server.close());
