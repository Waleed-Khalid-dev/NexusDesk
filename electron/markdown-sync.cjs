const fs = require('fs');
const path = require('path');

/**
 * Creates an Obsidian-flavored Markdown file for a trade.
 * @param {string} vaultPath - The absolute path to the Markdown vault.
 * @param {Object} trade - The trade object from the database.
 */
function syncTradeToMarkdown(vaultPath, trade) {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    return;
  }

  // Create filenames like: 2026-08-27-BTC-USDT-BUY.md
  const dateStr = new Date(trade.timestamp).toISOString().split('T')[0];
  const safeSymbol = trade.symbol.replace(/\//g, '-');
  const filename = `${dateStr}-${safeSymbol}-${trade.side.toUpperCase()}.md`;
  const filePath = path.join(vaultPath, filename);

  const tagsList = (trade.tags || []).map(t => `  - ${t}`).join('\n');

  const content = `---
type: trade
id: "${trade.id}"
exchange: "${trade.exchange}"
symbol: "${trade.symbol}"
side: "${trade.side}"
amount: ${trade.amount}
price: ${trade.price}
cost: ${trade.cost}
fee: ${trade.fee}
timestamp: ${trade.timestamp}
datetime: "${trade.datetime}"
tags:
${tagsList}
---

# Trade: ${trade.side.toUpperCase()} ${trade.symbol}
**Date:** ${new Date(trade.timestamp).toLocaleString()}
**Exchange:** ${trade.exchange}

## Execution
- **Amount:** ${trade.amount}
- **Price:** $${trade.price}
- **Cost:** $${trade.cost}
- **Fee:** $${trade.fee}

## Tags
${trade.tags.map(t => `#${t.replace(/\s+/g, '_')}`).join(' ')}

## Notes
_Write any post-trade analysis or thoughts here..._
`;

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[Markdown Sync] Saved trade to ${filePath}`);
}

module.exports = {
  syncTradeToMarkdown
};
