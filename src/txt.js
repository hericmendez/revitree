'use strict';

const { icon, formatSize, formatDirectorySize } = require('./tree');

function renderTxt(tree, { showSize = false } = {}) {
  const rootSize = showSize ? ` (${formatDirectorySize(tree)})` : '';
  const lines = [`📁 ${tree.name}/${rootSize}`];

  function walk(node, prefix) {
    const entries = [...node.children];
    if (node.error) entries.push({ type: 'error', name: `[não foi possível ler: ${node.error}]` });

    entries.forEach((entry, index) => {
      const last = index === entries.length - 1;
      const branch = last ? '└── ' : '├── ';
      const marker = entry.type === 'error' ? '⚠️' : icon(entry.type);
      const size = !showSize ? ''
        : entry.type === 'directory' ? ` (${formatDirectorySize(entry)})`
          : entry.type === 'file' ? ` (${formatSize(entry.size)})` : '';
      lines.push(`${prefix}${branch}${marker} ${entry.name}${entry.type === 'directory' ? '/' : ''}${size}`);
      if (entry.type === 'directory') {
        walk(entry, prefix + (last ? '    ' : '│   '));
      }
    });
  }

  walk(tree, '');
  return lines.join('\n') + '\n';
}

module.exports = { renderTxt };
