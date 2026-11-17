'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_IGNORE = ['.git', 'node_modules'];
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function createTree(rootDir, {
  ignore = DEFAULT_IGNORE,
  excludePaths = [],
  depth = Infinity,
  showSize = false,
  sort = 'title',
} = {}) {
  if (!['title', 'size'].includes(sort)) throw new Error('Ordenação inválida: use title ou size.');
  // Ordenar por tamanho exige metadados mesmo sem --size.
  const collectSizes = showSize || sort === 'size';
  const ignored = new Set(ignore);
  const excluded = new Set(excludePaths.map((item) => path.resolve(item)));

  function shouldInclude(dir, name) {
    return !ignored.has(name) && !excluded.has(path.resolve(dir, name));
  }

  // Retorna somente bytes de arquivos comuns. Symlinks nunca são seguidos.
  function fileSize(filePath) {
    try {
      const stat = fs.lstatSync(filePath);
      return stat.isFile() ? stat.size : null;
    } catch {
      return null;
    }
  }

  // --depth limita apenas a exibição; o tamanho deve abranger também os
  // descendentes ocultos pelo limite. Este percurso não cria nós de UI.
  function scanHiddenSize(dir) {
    let size = 0;
    let sizeIncomplete = false;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return { size, sizeIncomplete: true };
    }

    for (const entry of entries) {
      if (!shouldInclude(dir, entry.name) || entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = scanHiddenSize(fullPath);
        size += sub.size;
        if (sub.sizeIncomplete) sizeIncomplete = true;
      } else if (entry.isFile()) {
        const bytes = fileSize(fullPath);
        if (bytes === null) sizeIncomplete = true;
        else size += bytes;
      }
    }

    return { size, sizeIncomplete };
  }

  function visit(dir, name, level, relativePath) {
    const node = { name, type: 'directory', relativePath, children: [] };
    if (collectSizes) {
      node.size = 0;
      node.sizeIncomplete = false;
    }

    if (level >= depth) {
      node.limited = true;
      if (collectSizes) Object.assign(node, scanHiddenSize(dir));
      return node;
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      node.error = error.code || 'Erro de leitura';
      if (collectSizes) node.sizeIncomplete = true;
      return node;
    }

    entries = entries.filter((entry) => shouldInclude(dir, entry.name));

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const childRelativePath = relativePath === '.'
        ? entry.name
        : path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        const child = visit(fullPath, entry.name, level + 1, childRelativePath);
        node.children.push(child);
        if (collectSizes) {
          node.size += child.size;
          if (child.sizeIncomplete) node.sizeIncomplete = true;
        }
        continue;
      }

      const child = {
        name: entry.name,
        type: entry.isSymbolicLink() ? 'link' : 'file',
        relativePath: childRelativePath,
      };

      if (collectSizes && entry.isFile()) {
        child.size = fileSize(fullPath);
        if (child.size === null) node.sizeIncomplete = true;
        else node.size += child.size;
      }

      node.children.push(child);
    }

    // Ordenação após a visita: tamanhos de pastas já incluem subpastas.
    // Diretórios continuam antes dos arquivos em ambos os modos.
    node.children.sort((a, b) => {
      const foldersFirst = Number(b.type === 'directory') - Number(a.type === 'directory');
      if (foldersFirst) return foldersFirst;
      if (sort === 'size') {
        const aBytes = Number.isFinite(a.size) ? a.size : -1;
        const bBytes = Number.isFinite(b.size) ? b.size : -1;
        if (aBytes !== bBytes) return bBytes - aBytes;
      }
      return collator.compare(a.name, b.name);
    });
    return node;
  }

  return visit(rootDir, path.basename(rootDir) || path.parse(rootDir).root, 0, '.');
}

function countTree(tree) {
  const stats = { folders: 0, files: 0, links: 0, errors: 0 };
  function count(node) {
    if (node.error) stats.errors++;
    for (const child of node.children || []) {
      if (child.type === 'directory') {
        stats.folders++;
        count(child);
      } else if (child.type === 'link') {
        stats.links++;
      } else {
        stats.files++;
      }
    }
  }
  count(tree);
  return stats;
}

function formatSize(bytes) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return 'indisponível';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
  const value = bytes / (1024 ** exponent);
  const precision = value < 10 ? 1 : 0;
  return `${value.toFixed(precision).replace(/\.0$/, '')} ${units[exponent - 1]}`;
}

// Em caso de erro de leitura, o número é um limite inferior, não um total exato.
function formatDirectorySize(node) {
  const size = formatSize(node.size);
  return node.sizeIncomplete ? `≥ ${size}; parcial` : size;
}

function icon(type) {
  return type === 'directory' ? '📁' : type === 'link' ? '🔗' : '📄';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

module.exports = {
  createTree, countTree, formatSize, formatDirectorySize,
  icon, escapeHtml, DEFAULT_IGNORE,
};
