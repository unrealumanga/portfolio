#!/usr/bin/env bash
# serve.sh — Zero-dependency local dev server
# Usage:  ./serve.sh [port]

set -euo pipefail
PORT="${1:-8080}"
DIR="$(cd "$(dirname "$0")" && pwd)"

if command -v python3 &>/dev/null; then
  echo "[serve] python3 server on http://localhost:$PORT"
  cd "$DIR"
  exec python3 -m http.server "$PORT"
elif command -v node &>/dev/null; then
  echo "[serve] node static server on http://localhost:$PORT"
  cd "$DIR"
  exec node -e "
    const http = require('http'), fs = require('fs'), path = require('path');
    const types = { '.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.mp4':'video/mp4','.webm':'video/webm','.svg':'image/svg+xml' };
    http.createServer((req, res) => {
      let file = path.join('$DIR', req.url === '/' ? '/index.html' : req.url);
      if (!fs.existsSync(file)) return res.writeHead(404).end('404');
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    }).listen($PORT, () => console.log('[serve] http://localhost:$PORT'));
  "
else
  echo "ERROR: need python3 or node" >&2
  exit 1
fi
