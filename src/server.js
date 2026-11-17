'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { renderHtml } = require('./html');

const HOST = '127.0.0.1';
const MAX_BODY = 8192;

// Executa o gerenciador de arquivos, sem shell e sem interpretar o nome como comando.
function revealInFileManager(fullPath, type, platform = process.platform, spawnProcess = spawn) {
  let command;
  let args;

  if (platform === 'win32') {
    command = 'explorer.exe';
    args = type === 'directory' ? [fullPath] : ['/select,', fullPath];
  } else if (platform === 'darwin') {
    command = 'open';
    args = type === 'directory' ? [fullPath] : ['-R', fullPath];
  } else if (platform === 'linux') {
    command = 'xdg-open';
    args = [type === 'directory' ? fullPath : path.dirname(fullPath)];
  } else {
    return Promise.reject(new Error(`Sistema não suportado: ${platform}`));
  }

  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function indexPaths(tree, rootDir) {
  const index = new Map();
  function walk(node) {
    const relative = node.relativePath ?? '.';
    index.set(relative, {
      fullPath: path.resolve(rootDir, relative),
      type: node.type,
    });
    for (const child of node.children || []) walk(child);
  }
  walk(tree);
  return index;
}

function sendJson(res, status, object) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(object));
}

async function startLocalServer(tree, rootDir, {
  showSize = false,
  openLocation = revealInFileManager,
} = {}) {
  const token = randomBytes(32).toString('hex');
  const paths = indexPaths(tree, rootDir);
  const html = renderHtml(tree, { showSize, serverToken: token });

  const server = http.createServer(async (req, res) => {
    const address = server.address();
    const origin = `http://${HOST}:${address.port}`;

    // Protege contra DNS rebinding e requisições cross-origin a um serviço local.
    if (req.headers.host !== `${HOST}:${address.port}`) {
      sendJson(res, 403, { error: 'Host inválido.' });
      return;
    }

    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
      res.end(html);
      return;
    }

    if (req.method !== 'POST' || req.url !== '/api/reveal') {
      sendJson(res, 404, { error: 'Rota não encontrada.' });
      return;
    }

    if (req.headers.origin !== origin || req.headers['x-revitree-token'] !== token) {
      sendJson(res, 403, { error: 'Acesso não autorizado.' });
      return;
    }

    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      sendJson(res, 415, { error: 'Envie JSON.' });
      return;
    }

    const chunks = [];
    let bodySize = 0;
    try {
      for await (const chunk of req) {
        bodySize += chunk.length;
        if (bodySize > MAX_BODY) {
          sendJson(res, 413, { error: 'Requisição muito grande.' });
          return;
        }
        chunks.push(chunk);
      }
    } catch {
      if (!res.writableEnded) sendJson(res, 400, { error: 'Requisição inválida.' });
      return;
    }

    let requestedPath;
    try {
      requestedPath = JSON.parse(Buffer.concat(chunks).toString('utf8')).path;
    } catch {
      sendJson(res, 400, { error: 'JSON inválido.' });
      return;
    }

    // Aceita APENAS os caminhos que estavam presentes na árvore gerada.
    if (typeof requestedPath !== 'string' || !paths.has(requestedPath)) {
      sendJson(res, 404, { error: 'Item não encontrado na árvore.' });
      return;
    }

    const item = paths.get(requestedPath);
    try {
      fs.lstatSync(item.fullPath);
    } catch {
      sendJson(res, 404, { error: 'O item não existe mais.' });
      return;
    }

    try {
      await openLocation(item.fullPath, item.type);
      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 500, { error: 'Falha ao iniciar o explorador de arquivos.' });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return {
    server,
    url: `http://${HOST}:${server.address().port}/`,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    ),
  };
}

module.exports = { startLocalServer, revealInFileManager, indexPaths };
