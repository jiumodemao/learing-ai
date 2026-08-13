// 多AI 局域网服务器（零依赖，Node 自带 http 模块）
// 用途：同一 WiFi 下，家人手机浏览器打开 http://<本机IP>:8080 即可使用
// 启动：双击「启动局域网版.bat」或命令行 node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = 8080;

// 禁止对外暴露的目录（密钥、私有知识库、git）
const BLOCKED = ['/.secrets/', '/.git/', '/docs/knowledge-base/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let urlPath = (req.url || '/').split('?')[0];
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch {
    // 非法编码的 URL 直接拒绝，不让服务器崩溃
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  // 安全防护：敏感目录一律 403
  if (BLOCKED.some((b) => urlPath.startsWith(b))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==========================================');
  console.log('  多AI 局域网版已启动！');
  console.log('  电脑本机访问: http://localhost:' + PORT);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  手机访问:     http://' + net.address + ':' + PORT + '   （发给家人这个网址）');
      }
    }
  }
  console.log('==========================================');
  console.log('  保持本窗口开启，家人才能用。按 Ctrl+C 停止。');
  console.log('  首次启动若弹出防火墙提示，请点「允许访问」。');
});
