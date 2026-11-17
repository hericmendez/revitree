'use strict';

const { icon, escapeHtml, formatSize, formatDirectorySize } = require('./tree');

function renderMd(tree, { showSize = false } = {}) {
  const lines = ['<!-- Árvore colapsável: clique nas pastas para expandir. -->', ''];

  function walk(node, isRoot = false) {
    const name = escapeHtml(node.name);
    if (node.type !== 'directory') {
      const size = showSize && node.type === 'file'
        ? ` <small>(${formatSize(node.size)})</small>` : '';
      lines.push(`<li>${icon(node.type)} ${name}${size}</li>`);
      return;
    }

    lines.push(`<details${isRoot ? ' open' : ''}>`);
    const size = showSize ? ` <small>(${formatDirectorySize(node)})</small>` : '';
    lines.push(`<summary>📁 ${name}/${size}</summary>`);
    lines.push('');
    lines.push('<ul>');

    for (const child of node.children) {
      if (child.type === 'directory') {
        lines.push('<li>');
        walk(child);
        lines.push('</li>');
      } else {
        walk(child);
      }
    }

    if (node.error) lines.push(`<li>⚠️ Não foi possível ler: ${escapeHtml(node.error)}</li>`);
    if (node.children.length === 0 && !node.error && !node.limited) {
      lines.push('<li><em>(pasta vazia)</em></li>');
    }
    if (node.limited) lines.push('<li><em>(limite de profundidade)</em></li>');

    lines.push('</ul>');
    lines.push('</details>');
  }

  walk(tree, true);
  lines.push('');
  return lines.join('\n');
}

module.exports = { renderMd };
