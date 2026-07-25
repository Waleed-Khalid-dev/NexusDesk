# Crypto Hub / NexusDesk

Unified crypto trading command center: **Crypto Bubbles + TradingView + CoinGlass liquidation heatmap + Multi-Tab Workspace**.

## Features & Highlights

- **Multi-Tab Workspace System**: Monitor multiple coins simultaneously by switching between tabs in the control header bar. Create (`+`), rename (double-click), close (`x`), and switch tabs without losing previous configurations.
- **Lightweight Active Tab Navigation**: High-performance state updating via IPC cross-pane synchronization (`setSymbol`) without opening extra application windows or wasting RAM/GPU resources.
- **Automatic Settings Persistence**: Open tabs, active tab ID, window layout split ratios, and last active symbols automatically save to `%AppData%\NexusDesk\hub-settings.json` and persist across application restarts.
- **WebContentsView Isolation**: Real Chromium desktop panes load TradingView, CoinGlass, and CoinMarketCap directly, maintaining full login sessions without iframe Google 403 or CORS restrictions.

---

## Desktop App (Recommended)

```bash
cd crypto-dashboard
npm install
npm run desktop
```

This launches the **Electron desktop app** featuring a single window with four isolated browser panes:

| Pane | Site / Interface |
|------|------------------|
| Top | Glassmorphic Control Bar with Multi-Tab Workspace & Omnibar |
| Left | CryptoBubbles (cryptobubbles.net) |
| Center | TradingView Chart (tradingview.com/chart - log in directly) |
| Right | CoinGlass Liquidation Heatmap (coinglass.com - log in directly) |
| Bottom | CoinMarketCap / AI Co-Pilot / Portfolio Vault / Arbitrage |

### Layout & Tab Controls

- **Tab Management**: Click `+` to open a tab, click `x` to close a tab, double-click tab label to rename, click tab to switch active coin focus.
- **Drag Resizing**: Drag the thin green vertical/horizontal dividers to dynamically resize panes.
- **Panel Toggles**: Collapse/expand left (Bubbles) or right (Heatmap) panels on demand.
- **Reset Layout**: Instant reset button to restore default pane proportions.

---

## Web App (Browser Mode)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Left: CryptoBubbles iframe
- Center: TradingView widget
- Right: CoinGlass external popup link

---

## Command Reference

| Command | Description |
|---------|-------------|
| `npm run desktop` | Launch Electron Multi-Tab Desktop Command Center |
| `npm run dev` | Launch Next.js web application |
| `npm run build` | Build production bundle |
| `npm start` | Serve production build |

---

## Tech Stack

- **Desktop:** Electron `BaseWindow` + `WebContentsView` multi-pane manager
- **State & Storage:** Node.js IPC, Windows DPAPI (`electron.safeStorage`), SQLite (`better-sqlite3`)
- **Web:** Next.js, React, Vanilla CSS3 (Dark Glassmorphism)
