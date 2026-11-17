#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createTree, DEFAULT_IGNORE } = require('../src/tree');
const { renderTxt } = require('../src/txt');
const { renderMd } = require('../src/md');
const { renderHtml } = require('../src/html');
const { startLocalServer } = require('../src/server');

const HELP = `ReviTree — visualize pastas em TXT, Markdown ou HTML.

Uso:
  revitree [diretório] [opções]

Opções:
  --md                  Gera Markdown colapsável (.md)
  --html                Gera explorador HTML interativo (.html)
  --size                Exibe arquivos e tamanho recursivo das pastas
  --sort title|size     Ordena por título (padrão) ou tamanho decrescente
  --depth N             Limita os níveis (0 = apenas raiz; padrão = infinito)
  --serve               Habilita "Abrir local" no HTML via servidor localhost
  -o, --output ARQUIVO  Define o arquivo de saída
  --ignore NOMES        Ignora nomes, separados por vírgula; pode repetir
  -h, --help            Mostra esta ajuda

Padrão: TXT (.txt) da pasta atual, ignorando .git e node_modules.

Exemplos:
  revitree
  revitree --size --md
  revitree --sort size --depth 2
  revitree --html --sort size
  revitree ./src --depth 2 --html
  revitree --html --serve
  revitree --ignore .next,dist --output arvore.txt
`;

function parseArgs(args) {
  const options = {
    format: 'txt', directory: null, output: null,
    depth: Infinity, ignored: [], showSize: false, serve: false, sort: 'title',
  };
  let formatSeen = false;
  let literalPaths = false;

  function readValue(index, flag) {
    if (index + 1 >= args.length || (!literalPaths && args[index + 1].startsWith('--'))) {
      throw new Error(`Falta valor para ${flag}.`);
    }
    return args[index + 1];
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!literalPaths && arg === '--') { literalPaths = true; continue; }
    if (!literalPaths && (arg === '-h' || arg === '--help')) {
      options.help = true;
      return options;
    }
    if (!literalPaths && (arg === '--md' || arg === '--html')) {
      if (formatSeen) throw new Error('Escolha apenas um formato: --md ou --html.');
      options.format = arg === '--md' ? 'md' : 'html';
      formatSeen = true;
      continue;
    }
    if (!literalPaths && arg === '--size') {
      options.showSize = true;
      continue;
    }
    if (!literalPaths && arg === '--sort') {
      const value = readValue(i, arg);
      if (!['title', 'size'].includes(value)) {
        throw new Error('--sort aceita apenas title ou size.');
      }
      options.sort = value;
      i++;
      continue;
    }
    if (!literalPaths && arg === '--serve') {
      options.serve = true;
      continue;
    }
    if (!literalPaths && (arg === '-o' || arg === '--output')) {
      options.output = readValue(i, arg);
      i++;
      continue;
    }
    if (!literalPaths && arg === '--depth') {
      const value = readValue(i, arg);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error('--depth precisa ser um inteiro maior ou igual a zero.');
      }
      options.depth = Number(value);
      i++;
      continue;
    }
    if (!literalPaths && arg === '--ignore') {
      const value = readValue(i, arg);
      const names = value.split(',').map((name) => name.trim()).filter(Boolean);
      if (!names.length) throw new Error('--ignore requer um ou mais nomes.');
      options.ignored.push(...names);
      i++;
      continue;
    }
    if (!literalPaths && arg.startsWith('-')) throw new Error(`Opção desconhecida: ${arg}`);
    if (options.directory !== null) throw new Error('Informe apenas um diretório.');
    options.directory = arg;
  }

  if (options.serve && options.format !== 'html') {
    throw new Error('--serve só funciona com --html.');
  }
  return options;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(HELP);
    return;
  }

  const targetDir = path.resolve(options.directory || process.cwd());
  if (!fs.statSync(targetDir).isDirectory()) throw new Error(`Não é um diretório: ${targetDir}`);

  const rootName = path.basename(targetDir) || 'root';
  const defaultBase = `${rootName}_tree`;
  const output = path.resolve(options.output || `${defaultBase}.${options.format}`);
  const automaticOutputs = ['txt', 'md', 'html'].map((ext) =>
    path.resolve(process.cwd(), `${defaultBase}.${ext}`)
  );

  const tree = createTree(targetDir, {
    ignore: [...DEFAULT_IGNORE, ...options.ignored],
    depth: options.depth,
    // HTML precisa dos tamanhos para reordenar offline, mesmo sem exibi-los.
    showSize: options.showSize || options.format === 'html' || options.sort === 'size',
    sort: options.sort,
    excludePaths: [...automaticOutputs, output],
  });

  const renderOptions = { showSize: options.showSize, sort: options.sort };
  const contents = options.format === 'md'
    ? renderMd(tree, renderOptions)
    : options.format === 'html'
      ? renderHtml(tree, renderOptions)
      : renderTxt(tree, renderOptions);

  fs.writeFileSync(output, contents, 'utf8');
  console.log(`ReviTree: ${output}`);

  if (options.serve) {
    const server = await startLocalServer(tree, targetDir, renderOptions);
    console.log(`Explorador local: ${server.url}`);
    console.log('Abra essa URL no navegador; Ctrl+C encerra o servidor.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`ReviTree: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, main };
