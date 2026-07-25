# NexusDesk Architecture & Technical Documentation

NexusDesk is an Electron desktop application designed with multi-pane isolation using Chromium `WebContentsView` instances instead of standard iframes.

## System Overview & Component Layout

```
+-----------------------------------------------------------------------------------+
|               Top Control Bar (control.html) & Multi-Tab Workspace                |
+-------------------+-----------------------------------+---------------------------+
| CryptoBubbles     | TradingView Chart                 | Coinglass Heatmap         |
| (WebContentsView) | (WebContentsView)                 | (WebContentsView)         |
+-------------------+-----------------------------------+---------------------------+
|                   | CoinMarketCap Panel / AI Chat /   |                           |
|                   | Arbitrage / Vault (Dynamic Views) |                           |
+-------------------+-----------------------------------+---------------------------+
```

## Core Modules

### 1. Electron Main Process & Tab Registry (`electron/main.cjs`)
- **Window & Layout Management:** Controls dynamic pane resizing, side panel collapsing, and split-screen bounds using Electron `WebContentsView`.
- **Multi-Tab Workspace System:** Manages an array of workspace tabs (`workspaceTabs`) and `activeTabId`. Re-renders active trading pairs on tab switch without instantiating unnecessary `WebContentsView` processes.
- **Persistence Engine:** Automatically serializes tab lists, custom labels, active tab selection, and layout percentages to `%AppData%\NexusDesk\hub-settings.json`.
- **Security & Key Vault:** Encrypts API keys (Binance, Gemini AI, CoinMarketCap, LunarCrush) using Windows Data Protection API (`safeStorage` / DPAPI).
- **Navigation & Event Overrides:** Intercepts `will-prevent-unload` events on TradingView `WebContents` to ensure chart interactions do not block coin search navigation.

### 2. Market Intelligence Engine (`electron/market-intel.cjs`)
- **Extreme Squeeze Radar:** Background worker scanning global funding rates via CCXT. Triggers desktop notifications when threshold funding spikes occur (+/-0.5%).
- **Open Interest & Micro-Charts:** Fetches exchange derivatives metrics and dynamic 12-hour funding rate sparklines.
- **CoinMarketCap Slug Resolver:** Asynchronously resolves ticker symbols to official CMC URL slugs to guarantee valid panel routing.

### 3. Vault & Portfolio Engine (`electron/portfolio.cjs`)
- **Local Database:** Uses SQLite (`better-sqlite3`) to track portfolio transactions, execution logs, and trade safety limits server-side.
- **Safety System:** Validates proposed trades against user-configured USD position caps before allowing execution.

## IPC Communication Protocols

| Event | Direction | Payload / Action |
|---|---|---|
| `get-state` | Renderer -> Main | Requests full application state payload (includes `workspaceTabs`, `activeTabId`) |
| `set-symbol` | Renderer -> Main | `{ ticker, exchange }` -- updates active ticker across all panes and updates current tab |
| `create-tab` | Renderer -> Main | `{ ticker?, exchange? }` -- creates new workspace tab and switches context |
| `switch-tab` | Renderer -> Main | `tabId` -- switches active workspace tab and reloads all 4 panes |
| `close-tab` | Renderer -> Main | `tabId` -- closes target workspace tab and focuses adjacent tab |
| `rename-tab` | Renderer -> Main | `{ id, label }` -- updates display label of target workspace tab |
| `symbol-changed` | Main -> Renderer | Broadcasts updated ticker state & tabs state to control bar and UI panels |
| `cmc-tab` | Renderer -> Main | Switches CMC bottom panel tabs (`market`, `coin`) |
| `execute-trade` | Renderer -> Main | Executes trade via CCXT after safety cap validation |

## Security & Privacy Model

- **No Third-Party Analytics:** Zero telemetry or external tracking scripts.
- **Local Key Storage:** All API credentials are encrypted with DPAPI and stored in `%AppData%\NexusDesk\hub-keys.json`. They never touch codebase repositories or `.env` files.
