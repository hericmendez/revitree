'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('../bin/revitree');
const { createTree, countTree } = require('../src/tree');
const { renderHtml } = require('../src/html');

const script = path.resolve(__dirname, '../bin/revitree.js');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'revitree-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'src', 'app'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'src', 'app', 'page.tsx'), 'export default 42;');
  fs.writeFileSync(path.join(root, 'foo & bar.txt'), 'a');
  fs.writeFileSync(path.join(root, 'zeta.txt'), 'z');
  fs.writeFileSync(path.join(root, 'node_modules', 'hidden.js'), 'hidden');
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'hidden');
  fs.writeFileSync(path.join(root, 'dist', 'build.js'), 'build');
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test('TXT é o padrão, usa cwd, emojis e ignora .git/node_modules', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const out = fs.readFileSync(path.join(root, `${path.basename(root)}_tree.txt`), 'utf8');
  assert.match(out, /📁 src\//);
  assert.match(out, /📄 foo & bar\.txt/);
  assert.match(out, /└──|├──/);
  assert.doesNotMatch(out, /node_modules|hidden\.js|\.git/);
  assert.ok(out.indexOf('📁 src/') < out.indexOf('📄 foo & bar.txt'));

  // A segunda geração não pode indexar sua própria saída.
  assert.equal(run(root).status, 0);
  const second = fs.readFileSync(path.join(root, `${path.basename(root)}_tree.txt`), 'utf8');
  assert.equal(out, second);
});

test('Markdown gera details aninhados e faz escape de nomes', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  fs.mkdirSync(path.join(root, 'script & unsafe'));
  const result = run(root, '--md');
  assert.equal(result.status, 0, result.stderr);
  const out = fs.readFileSync(path.join(root, `${path.basename(root)}_tree.md`), 'utf8');
  assert.match(out, /<details open>/);
  assert.match(out, /<summary>📁 src\/<\/summary>/);
  assert.match(out, /<summary>📁 app\/<\/summary>/);
  assert.match(out, /foo &amp; bar\.txt/);
  assert.match(out, /script &amp; unsafe/);

  // Teste de segurança sem criar nomes inválidos no Windows.
  const maliciousTree = createTree(root);
  maliciousTree.children.push({ name: '<script>', type: 'file', relativePath: 'unsafe' });
  const escapedMd = renderMd(maliciousTree);
  assert.match(escapedMd, /&lt;script&gt;/);
  assert.doesNotMatch(escapedMd, /<li>📄 <script>/);
  assert.equal((out.match(/<details(?: open)?>/g) || []).length,
    (out.match(/<\/details>/g) || []).length);
});

test('HTML é independente e script gerado tem sintaxe JS válida', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  fs.mkdirSync(path.join(root, 'img & unsafe'));
  const result = run(root, '--html');
  assert.equal(result.status, 0, result.stderr);
  const html = fs.readFileSync(path.join(root, `${path.basename(root)}_tree.html`), 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Expandir tudo|Recolher tudo/);
  assert.match(html, /id="search"/);
  assert.match(html, /img &amp; unsafe/);

  const maliciousTree = createTree(root);
  maliciousTree.children.push({ name: '<img onerror=alert(1)>', type: 'file', relativePath: 'unsafe' });
  const escapedHtml = renderHtml(maliciousTree);
  assert.match(escapedHtml, /&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(escapedHtml, /<img onerror=alert\(1\)>/);
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'HTML deve incluir JS inline');
  assert.doesNotThrow(() => new Function(scriptMatch[1]));
});

test('--depth, --ignore, -o e path personalizado funcionam', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revitree-output-'));
  t.after(() => cleanup(exportDir));
  const out = path.join(exportDir, 'custom.md');
  const result = run(root, root, '--md', '--depth', '1', '--ignore', 'dist', '-o', out);
  assert.equal(result.status, 0, result.stderr);
  const text = fs.readFileSync(out, 'utf8');
  assert.match(text, /<summary>📁 src\//);
  assert.doesNotMatch(text, /page\.tsx|dist/);
  assert.match(text, /limite de profundidade/);
});

test('links simbólicos são exibidos mas não percorridos', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  try {
    fs.symlinkSync(root, path.join(root, 'circular-link'), 'dir');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('Sem permissão para symlink');
    throw error;
  }
  const tree = createTree(root);
  const stats = countTree(tree);
  assert.equal(stats.links, 1);
  assert.ok(tree.children.some((c) => c.name === 'circular-link' && c.type === 'link'));
  assert.match(renderHtml(tree), /🔗/);
});

test('argumentos inválidos retornam erro e ajudam com --help', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  assert.equal(run(root, '--md', '--html').status, 1);
  assert.equal(run(root, '--depth', '-1').status, 1);
  assert.equal(run(root, '--unknown').status, 1);
  const help = run(root, '--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /revitree/);
  assert.deepEqual(parseArgs(['./src', '--html']).format, 'html');
});

const { EventEmitter } = require('node:events');
const http = require('node:http');
const { formatSize, formatDirectorySize } = require('../src/tree');
const { renderMd } = require('../src/md');
const { renderTxt } = require('../src/txt');
const { startLocalServer, revealInFileManager } = require('../src/server');

test('--size é opcional e exibe tamanhos nos três formatos', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  fs.writeFileSync(path.join(root, 'large.bin'), Buffer.alloc(1536));
  fs.writeFileSync(path.join(root, 'zero.bin'), '');

  const plain = run(root);
  assert.equal(plain.status, 0, plain.stderr);
  const base = `${path.basename(root)}_tree`;
  const original = fs.readFileSync(path.join(root, base + '.txt'), 'utf8');
  assert.doesNotMatch(original, /KiB| B\)/);

  const txt = run(root, '--size');
  assert.equal(txt.status, 0, txt.stderr);
  const txtContents = fs.readFileSync(path.join(root, base + '.txt'), 'utf8');
  assert.match(txtContents, /large\.bin \(1\.5 KiB\)/);
  assert.match(txtContents, /zero\.bin \(0 B\)/);
  assert.match(txtContents, /src\/ \(18 B\)/);

  const md = run(root, '--md', '--size');
  assert.equal(md.status, 0, md.stderr);
  const mdContents = fs.readFileSync(path.join(root, base + '.md'), 'utf8');
  assert.match(mdContents, /large\.bin <small>\(1\.5 KiB\)<\/small>/);
  assert.match(mdContents, /<summary>📁 src\/ <small>\(18 B\)<\/small><\/summary>/);

  const html = run(root, '--html', '--size');
  assert.equal(html.status, 0, html.stderr);
  const htmlContents = fs.readFileSync(path.join(root, base + '.html'), 'utf8');
  assert.match(htmlContents, /class="size">1\.5 KiB<\/span>/);
  assert.match(htmlContents, /data-path="large\.bin"/);
  assert.match(htmlContents, /class="size folder-size">18 B<\/span>/);
  assert.match(htmlContents, /class="stat">💾 1\.5 KiB no total<\/span>/);
  assert.match(htmlContents, /id="context-menu"/);
  assert.match(htmlContents, /Abrir local do arquivo/);
  assert.match(htmlContents, /const serverToken = "";/);
});

test('formatSize usa múltiplos binários sem arredondar bytes pequenos', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(1023), '1023 B');
  assert.equal(formatSize(1024), '1 KiB');
  assert.equal(formatSize(1536), '1.5 KiB');
  assert.equal(formatSize(1024 ** 2), '1 MiB');
  assert.equal(formatSize(null), 'indisponível');
});

test('--depth 0/1/2 e padrão ilimitado são coerentes', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));

  const unlimited = createTree(root);
  assert.match(renderMd(unlimited), /page\.tsx/);

  const at0 = createTree(root, { depth: 0 });
  assert.equal(at0.children.length, 0);
  assert.equal(at0.limited, true);

  const at1 = createTree(root, { depth: 1 });
  assert.ok(at1.children.some((node) => node.name === 'src'));
  assert.equal(at1.children.find((node) => node.name === 'src').children.length, 0);

  const at2 = createTree(root, { depth: 2 });
  const src = at2.children.find((node) => node.name === 'src');
  assert.ok(src.children.some((node) => node.name === 'app'));
  assert.equal(src.children.find((node) => node.name === 'app').children.length, 0);
});

test('a CLI valida --serve e --size', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  assert.equal(parseArgs(['--size']).showSize, true);
  assert.equal(parseArgs(['--html', '--serve']).serve, true);
  assert.equal(parseArgs(['--depth', '0']).depth, 0);
  assert.equal(parseArgs([]).depth, Infinity);
  assert.equal(run(root, '--serve').status, 1);
  assert.equal(run(root, '--md', '--serve').status, 1);
  assert.equal(run(root, '--depth', '1.5').status, 1);
});


test('pastas acumulam bytes recursivamente, inclusive níveis ocultos por --depth', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.mkdirSync(path.join(root, 'assets', 'nested'));
  fs.mkdirSync(path.join(root, 'empty'));
  fs.writeFileSync(path.join(root, 'assets', 'a.bin'), Buffer.alloc(1024));
  fs.writeFileSync(path.join(root, 'assets', 'nested', 'b.bin'), Buffer.alloc(2048));

  // 18 (page.tsx) + 1 (foo) + 1 (zeta) + 5 (build) + 3072 (assets)
  const total = 3097;
  const unlimited = createTree(root, { showSize: true });
  assert.equal(unlimited.size, total);
  assert.equal(unlimited.sizeIncomplete, false);
  const assets = unlimited.children.find((node) => node.name === 'assets');
  const nested = assets.children.find((node) => node.name === 'nested');
  assert.equal(assets.size, 3072);
  assert.equal(nested.size, 2048);
  assert.equal(unlimited.children.find((node) => node.name === 'empty').size, 0);
  assert.equal(unlimited.children.find((node) => node.name === 'src').size, 18);

  const depth0 = createTree(root, { showSize: true, depth: 0 });
  assert.equal(depth0.children.length, 0);
  assert.equal(depth0.size, total);
  const depth1 = createTree(root, { showSize: true, depth: 1 });
  const truncatedAssets = depth1.children.find((node) => node.name === 'assets');
  assert.equal(truncatedAssets.limited, true);
  assert.equal(truncatedAssets.children.length, 0);
  assert.equal(truncatedAssets.size, 3072);
  assert.equal(depth1.size, total);
  assert.equal(countTree(depth1).files, 2); // foo & bar.txt, zeta.txt

  const ignored = createTree(root, { showSize: true, depth: 1, ignore: ['.git', 'node_modules', 'dist'] });
  assert.equal(ignored.size, total - 5);
  assert.equal(ignored.children.some((node) => node.name === 'dist'), false);

  // Um symlink para o conteúdo já contabilizado não pode duplicar os bytes.
  try {
    fs.symlinkSync(path.join(root, 'assets'), path.join(root, 'alias-assets'), 'dir');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }
  assert.equal(createTree(root, { showSize: true, depth: 0 }).size, total);

  const result = run(root, '--size', '--depth', '1');
  assert.equal(result.status, 0, result.stderr);
  const outputPath = path.join(root, `${path.basename(root)}_tree.txt`);
  const txt = fs.readFileSync(outputPath, 'utf8');
  assert.match(txt, /📁 assets\/ \(3 KiB\)/);
  assert.match(txt.split('\n')[0], /\(3 KiB\)/);
  assert.doesNotMatch(txt, /a\.bin|b\.bin/);
  assert.equal(run(root, '--size', '--depth', '1').status, 0);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), txt);
});

test('sem --size as pastas não exibem total; erros indicam tamanho parcial', () => {
  const tree = {
    name: 'projeto', type: 'directory', relativePath: '.',
    children: [], size: 1024, sizeIncomplete: true,
  };
  assert.equal(formatDirectorySize(tree), '≥ 1 KiB; parcial');
  assert.equal(formatDirectorySize({ size: 0, sizeIncomplete: false }), '0 B');
  assert.match(renderHtml(tree, { showSize: true }), /≥ 1 KiB; parcial/);
  assert.doesNotMatch(renderHtml(tree), /folder-size|💾/);
  assert.match(renderMd(tree, { showSize: true }), /≥ 1 KiB; parcial/);
  assert.doesNotMatch(renderMd(tree), /KiB/);
  assert.match(renderTxt(tree, { showSize: true }), /📁 projeto\/ \(≥ 1 KiB; parcial\)/);
  assert.doesNotMatch(renderTxt(tree), /KiB/);
});


test('falha de acesso mantém soma mínima e propaga aviso até a raiz', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  const inaccessible = path.join(root, 'src', 'app');
  const originalReadDir = fs.readdirSync;
  fs.readdirSync = function (filePath, ...args) {
    if (filePath === inaccessible) {
      const error = new Error('Acesso negado');
      error.code = 'EACCES';
      throw error;
    }
    return originalReadDir.call(this, filePath, ...args);
  };
  try {
    // src é truncado: a falha acontece durante o cálculo oculto.
    const tree = createTree(root, { showSize: true, depth: 1 });
    const src = tree.children.find((node) => node.name === 'src');
    assert.equal(src.size, 0);
    assert.equal(src.sizeIncomplete, true);
    assert.equal(tree.size, 7); // 5 (dist) + 1 (foo) + 1 (zeta)
    assert.equal(tree.sizeIncomplete, true);
    assert.match(renderTxt(tree, { showSize: true }), /≥ 7 B; parcial/);
  } finally {
    fs.readdirSync = originalReadDir;
  }
});

test('o servidor local exige origem, token e item existente na árvore', async (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  const tree = createTree(root, { depth: 2, showSize: true });
  const opened = [];
  const session = await startLocalServer(tree, root, {
    showSize: true,
    openLocation: async (filePath, type) => opened.push({ filePath, type }),
  });
  t.after(async () => session.close());

  const htmlResponse = await fetch(session.url);
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  assert.match(html, /Abrir local do arquivo/);
  const token = html.match(/const serverToken = "([a-f0-9]+)";/)?.[1];
  assert.ok(token);

  const endpoint = new URL('api/reveal', session.url);
  const headers = {
    'Content-Type': 'application/json',
    'X-Revitree-Token': token,
    Origin: session.url.slice(0, -1),
  };
  const post = (value, overrides = {}) => fetch(endpoint, {
    method: 'POST', headers: { ...headers, ...(overrides.headers || {}) },
    body: JSON.stringify({ path: value }),
  });

  assert.equal((await post('foo & bar.txt', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await post('foo & bar.txt', { headers: { 'X-Revitree-Token': 'wrong' } })).status, 403);
  assert.equal((await post('../outside.txt')).status, 404);
  assert.equal((await post('src/app/page.tsx')).status, 404); // depth 2: não foi incluído
  assert.equal(opened.length, 0);

  const allowed = await post('foo & bar.txt');
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { ok: true });
  assert.deepEqual(opened, [{ filePath: path.join(root, 'foo & bar.txt'), type: 'file' }]);

  const folder = await post('src');
  assert.equal(folder.status, 200);
  assert.deepEqual(opened[1], { filePath: path.join(root, 'src'), type: 'directory' });

  // Uma navegação que venha de outro Host não deve alcançar o documento.
  const invalidHost = await new Promise((resolve, reject) => {
    const req = http.get(session.url, { headers: { Host: 'host-externo.example' } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
  });
  assert.equal(invalidHost, 403);
});

test('o comando nativo de revelar local não usa shell e varia por sistema', async () => {
  const called = [];
  const fakeSpawn = (command, args, options) => {
    called.push({ command, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    process.nextTick(() => child.emit('spawn'));
    return child;
  };

  await revealInFileManager('C:\\my folder\\test.txt', 'file', 'win32', fakeSpawn);
  await revealInFileManager('/home/example/project/test.txt', 'file', 'linux', fakeSpawn);
  await revealInFileManager('/Users/me/test.txt', 'file', 'darwin', fakeSpawn);

  assert.equal(called[0].command, 'explorer.exe');
  assert.deepEqual(called[0].args, ['/select,', 'C:\\my folder\\test.txt']);
  assert.equal(called[1].command, 'xdg-open');
  assert.deepEqual(called[1].args, ['/home/example/project']);
  assert.equal(called[2].command, 'open');
  assert.deepEqual(called[2].args, ['-R', '/Users/me/test.txt']);
  assert.ok(called.every((call) => call.options.shell === false));
});


test('--sort valida title/size e mantém title como padrão', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  assert.equal(parseArgs([]).sort, 'title');
  assert.equal(parseArgs(['--sort', 'title']).sort, 'title');
  assert.equal(parseArgs(['--sort', 'size']).sort, 'size');
  assert.equal(parseArgs(['--sort', 'size', '--md']).sort, 'size');
  assert.equal(run(root, '--sort').status, 1);
  assert.equal(run(root, '--sort', 'random').status, 1);
  assert.equal(run(root, '--sort', '-1').status, 1);
  assert.match(run(root, '--help').stdout, /--sort title\|size/);
});

test('--sort size ordena irmãos por tamanho recursivo, pastas antes de arquivos e desempata por título', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  fs.mkdirSync(path.join(root, 'alpha'));
  fs.mkdirSync(path.join(root, 'zeta'));
  fs.mkdirSync(path.join(root, 'zeta', 'nested'));
  fs.writeFileSync(path.join(root, 'alpha', 'small.bin'), Buffer.alloc(3));
  fs.writeFileSync(path.join(root, 'zeta', 'nested', 'large.bin'), Buffer.alloc(100));
  fs.writeFileSync(path.join(root, 'aardvark.txt'), Buffer.alloc(1));
  fs.writeFileSync(path.join(root, 'big.txt'), Buffer.alloc(90));

  const title = createTree(root);
  assert.equal(title.children[0].name, 'alpha');
  assert.equal(title.children[1].name, 'dist');
  assert.equal(title.children[2].name, 'src');
  assert.equal(title.children[3].name, 'zeta');

  const sorted = createTree(root, { sort: 'size' });
  assert.deepEqual(
    sorted.children.filter((entry) => entry.type === 'directory').map((entry) => entry.name),
    ['zeta', 'src', 'dist', 'alpha']
  );
  const files = sorted.children.filter((entry) => entry.type === 'file');
  assert.equal(files[0].name, 'big.txt');
  assert.equal(files[0].size, 90);
  const singleByte = files.filter((entry) => entry.size === 1).map((entry) => entry.name);
  assert.deepEqual(singleByte, ['aardvark.txt', 'foo & bar.txt', 'zeta.txt']);

  // O tamanho das pastas deve usar o conteúdo oculto por --depth.
  const limited = createTree(root, { sort: 'size', depth: 1 });
  assert.equal(limited.children[0].name, 'zeta');
  assert.equal(limited.children[0].size, 100);
  assert.equal(limited.children[0].children.length, 0);
});

test('--sort size funciona em TXT e MD sem --size, sem alterar a exibição de bytes', (t) => {
  const root = fixture();
  t.after(() => cleanup(root));
  fs.mkdirSync(path.join(root, 'aaa'));
  fs.mkdirSync(path.join(root, 'zzz'));
  fs.writeFileSync(path.join(root, 'aaa', 'a.bin'), Buffer.alloc(2));
  fs.writeFileSync(path.join(root, 'zzz', 'z.bin'), Buffer.alloc(30));
  const base = path.basename(root) + '_tree';

  assert.equal(run(root, '--sort', 'size').status, 0);
  const txt = fs.readFileSync(path.join(root, base + '.txt'), 'utf8');
  assert.ok(txt.indexOf('📁 zzz/') < txt.indexOf('📁 aaa/'));
  assert.doesNotMatch(txt, /\(30 B\)|\(2 B\)/);

  assert.equal(run(root, '--md', '--sort', 'size').status, 0);
  const md = fs.readFileSync(path.join(root, base + '.md'), 'utf8');
  assert.ok(md.indexOf('📁 zzz/') < md.indexOf('📁 aaa/'));
  assert.doesNotMatch(md, /\(30 B\)|\(2 B\)/);

  assert.equal(run(root, '--html', '--sort', 'size').status, 0);
  const html = fs.readFileSync(path.join(root, base + '.html'), 'utf8');
  assert.ok(html.indexOf('data-name="zzz"') < html.indexOf('data-name="aaa"'));
  assert.match(html, /data-name="zzz"[^>]*data-size="30"/);
  assert.match(html, /id="sort-size"[^>]*aria-pressed="true"/);
  assert.match(html, /id="sort-title"[^>]*aria-pressed="false"/);
  assert.doesNotMatch(html, /class="size folder-size"/);
  assert.match(html, /function applySort\(mode\)/);
  assert.match(html, /list\.insertBefore\(child, note\)/);

  assert.equal(run(root, '--html', '--size', '--sort', 'title').status, 0);
  const titleHtml = fs.readFileSync(path.join(root, base + '.html'), 'utf8');
  assert.ok(titleHtml.indexOf('data-name="aaa"') < titleHtml.indexOf('data-name="zzz"'));
  assert.match(titleHtml, /id="sort-title"[^>]*aria-pressed="true"/);
  assert.match(titleHtml, /class="size folder-size">30 B<\/span>/);
});
