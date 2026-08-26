# NexusDesk: Complete Project Analysis, Scalability Roadmap & Developer Guide

> **Generated via Coordinator Mode (`@[orchestrator]` & `@[coordinator-mode]`)**  
> This document provides an exhaustive architectural breakdown, file-by-file analysis, scalability roadmap, startup manual, and safe modification guide for the **NexusDesk** (Crypto Dashboard) trading command center.

---

## 1. Executive Summary: What is NexusDesk?

**NexusDesk** is a pro-grade desktop cryptocurrency trading command center and market intelligence workspace. It bridges the gap between fragmented web trading platforms and professional quantitative desk software by combining a **Next.js web application** with a multi-process **Electron desktop application**.

### The Architectural Breakthrough: Chromium `WebContentsView` Isolation
Traditional desktop trading wrappers force web widgets (TradingView, Coinglass, CoinMarketCap, CryptoBubbles) into standard HTML `<iframe>` tags or a single browser window. This causes severe performance degradation, cross-origin CORS blocks, memory leaks, and UI freezing (such as TradingView navigation lockups).

NexusDesk solves this by utilizing **Electron 37's `WebContentsView` API**. The application orchestrates an array of native, independent Chromium browser views tiled seamlessly inside a unified dark-mode workspace:
- **Top Control Bar**: Native Electron HTML UI controlling tab state and symbol search.
- **Top Left Pane**: Dedicated Chromium view rendering **CryptoBubbles**.
- **Top Center Pane**: Dedicated Chromium view rendering **TradingView** live charts with automated `beforeunload` event interception.
- **Top Right Pane**: Dedicated Chromium view rendering the **Coinglass Liquidation Heatmap**.
- **Bottom Dynamic Pane**: Context-switching view rendering **CoinMarketCap**, the **AI Co-Pilot Chat**, **Cross-Exchange Arbitrage**, the **Extreme Squeeze Radar**, or the **DPAPI-Encrypted Vault**.

### Core Value Propositions
1. **Proactive Squeeze Radar**: Automatically monitors live derivative funding rates across exchanges via CCXT. Spikes beyond $\pm0.5\%$ trigger desktop push notifications and Open Interest (OI) tracking for potential short-squeezes.
2. **AI Co-Pilot (Google Gemini 2.5/Pro)**: An embedded AI assistant that automatically receives your encrypted portfolio balance, Fear & Greed Index, Altcoin Season metrics, and top gainers/losers as context on every prompt.
3. **Command Center Vault (Zero-Trust Security)**: Uses Windows Data Protection API (`electron.safeStorage` / DPAPI) to encrypt API keys at the OS level. Secrets never touch `.env` files or plain text.
4. **Multi-Tab Workspace Engine**: Allows instant switching between trading pairs (e.g., `BTC/USDT`, `SOL/USDT`, `DEXE/USDT`) without destroying or re-instantiating underlying Chromium processes, eliminating UI flickering and 404 navigation errors.

---

## 2. Exhaustive File-by-File Analysis

Every file in the repository serves a specific architectural purpose. Below is the complete catalog and technical breakdown of the codebase.

```
NexusDesk/
├── package.json & root configs      # Build scripts, dependencies, TypeScript & Next.js config
├── start.bat                        # One-click Windows development & production launcher
├── electron/                        # Desktop Backend, IPC Orchestrator & Native Panels
│   ├── main.cjs                     # Core Electron orchestrator & WebContentsView tiling engine
│   ├── preload.cjs                  # Context bridge isolating Node.js APIs from renderers
│   ├── market-intel.cjs             # Background data service (CCXT, Funding Rates, LunarCrush)
│   ├── portfolio.cjs                # SQLite database engine & Windows DPAPI vault encryption
│   ├── control.html                 # Top navigation bar, tab switcher & ticker search UI
│   ├── market-intel-ui.html         # Proactive Squeeze Radar & custom watchlist UI
│   ├── ai-chat.html                 # AI Co-Pilot chat UI with live market pulse strip
│   ├── portfolio.html               # Command Center Vault UI for API keys & balances
│   ├── arbitrage.html               # Cross-exchange price spread scanner UI
│   ├── liquidation.html             # Liquidation monitoring & heatmap UI
│   └── splitter.html                # Drag-handle UI for resizable workspace panes
├── app/ & components/               # Next.js 16 App Router Web Dashboard Frontend
├── lib/                             # Shared utility libraries & 400+ symbol dictionary
└── docs/ & .agent/                  # System architecture specifications & AI agent memory
```

### A. Root Configuration & Startup Files
| File Name | Role & Technical Description |
| :--- | :--- |
| **`package.json`** | Defines project metadata, npm scripts (`dev`, `build`, `desktop`), and dependencies. Key libraries include `electron`, `next`, `react`, `ccxt` (crypto trading APIs), `@google/generative-ai`, `electron-store`, and `sql.js`. |
| **`package-lock.json`** | Lockfile guaranteeing deterministic dependency trees and version consistency across environments. |
| **`start.bat`** | Windows Batch launcher script. Provides an interactive terminal menu to either start the Electron Desktop Command Center (`npm run desktop`) or the Next.js Web Server (`npm run dev`), automatically installing dependencies on first run. |
| **`tsconfig.json`** | TypeScript compiler configuration configured for Next.js App Router, strict type checking, and path aliases (`@/*`). |
| **`next.config.ts`** | Next.js runtime configuration (currently minimal, extensible for CORS, headers, or static exports). |
| **`postcss.config.mjs` / `eslint.config.mjs`** | PostCSS pipeline setup for Tailwind CSS v4 and ESLint linting rules tailored for Next.js 16 and React 19. |
| **`next-env.d.ts`** | TypeScript declaration file auto-generated by Next.js for Next.js-specific types. |
| **`.gitignore`** | Excludes `node_modules/`, `.next/`, `dist/`, OS storage, and local environment secrets from version control. |

### B. Electron Desktop Backend & Panels (`electron/`)
| File Name | Role & Technical Description |
| :--- | :--- |
| **`main.cjs`** | **The Core Orchestrator (74 KB).** Manages the application lifecycle, creates the primary `BrowserWindow`, and dynamically tiles four `WebContentsView` instances based on window resizing and splitter dragging. Implements the Multi-Tab Workspace registry (`workspaceTabs`, `activeTabId`) and handles IPC communication. Crucially implements a `will-prevent-unload` event override on TradingView to prevent chart widget scripts from locking up application navigation. |
| **`preload.cjs`** | **Security Bridge.** Executes before renderer web pages load. Exposes a secure, limited `window.electronAPI` object via `contextBridge`, allowing UI panels to invoke IPC methods (`set-symbol`, `create-tab`, `execute-trade`, `get-state`) without granting direct Node.js system access. |
| **`market-intel.cjs`** | **Market Intelligence Service (23 KB).** A background Node.js service using CCXT to continuously poll global funding rates and derivatives data. Calculates 12-hour funding sparkline trends, monitors Open Interest (OI) on Binance, queries LunarCrush v4 for social Galaxy Scores, and resolves cryptocurrency symbols against CoinMarketCap URL slugs. |
| **`portfolio.cjs`** | **Vault & Database Engine.** Manages local SQLite storage using `better-sqlite3` / `sql.js` for transaction history and trade logs. Handles encryption and decryption of API keys using Windows DPAPI (`electron.safeStorage`), ensuring keys can only be read by the logged-in Windows user on that specific machine. Implements trade safety checks (position USD caps). |
| **`control.html`** | **Top Bar Navigation UI.** Rendered in the top control view. Features the workspace tab switcher (create, rename, close, switch tabs), active pair display, exchange selector, and navigation buttons to open bottom panels (AI Chat, Squeeze Radar, Arbitrage, Vault). |
| **`market-intel-ui.html`** | **Squeeze Radar & Watchlist UI (44 KB).** A rich dark-mode interface rendering the Extreme Squeeze Radar (highlighting funding rate spikes $> \pm0.5\%$), Open Interest metrics, and a customizable pro-watchlist with Chart.js-powered 12-hour funding sparklines. Supports per-coin exchange selection. |
| **`ai-chat.html`** | **AI Co-Pilot UI (25 KB).** An interactive chat interface communicating with Google Gemini AI. Automatically injects live market pulse data (Fear & Greed, BTC Dominance, Altcoin Season, active portfolio balance) into system prompts. Includes trade proposal modals requiring manual user confirmation. |
| **`portfolio.html`** | **Command Center Vault UI (34 KB).** Provides secure input forms for Binance, Gemini AI, CoinMarketCap, and LunarCrush API keys. Displays aggregated spot and futures portfolio balances fetched in real-time via CCXT. |
| **`arbitrage.html`** | **Cross-Exchange Arbitrage UI (18 KB).** Scans and visualizes price spreads and arbitrage opportunities across connected exchanges for single pairs, Top 100 Gainers, or Top 100 Losers. |
| **`liquidation.html`** | **Liquidation Monitoring UI.** Displays liquidation heatmaps and real-time market flush data. |
| **`splitter.html`** | **Layout Resizer UI.** Rendered as a draggable dividing bar between the top chart panes and bottom dynamic pane, sending layout percentage updates via IPC to `main.cjs`. |
| **`test-ccxt.js`, `test-funding.js`, `test-oi.js`** | **Verification Scripts.** Standalone Node.js scripts used to test CCXT exchange connections, funding rate polling accuracy, and Open Interest data retrieval from command line during development. |

### C. Next.js Web Dashboard Frontend (`app/`, `components/`, `lib/`)
| File Name | Role & Technical Description |
| :--- | :--- |
| **`app/layout.tsx` & `globals.css`** | Root Next.js HTML layout with Inter/Outfit typography, dark-mode styling, and Tailwind CSS v4 / custom glassmorphism utility classes. |
| **`app/page.tsx`** | Main entry point for the web dashboard, mounting the `DashboardShell` component. |
| **`components/DashboardShell.tsx`** | **Web Workspace Coordinator.** Layout container for the browser-based version of NexusDesk, managing pane distribution between top bar, charts, and market data panels. |
| **`components/TopBar.tsx`** | Web equivalent of the control bar, handling symbol search and workspace navigation. |
| **`components/SymbolSearch.tsx`** | Search modal component with autocomplete for selecting trading pairs and exchanges. |
| **`components/TradingViewPanel.tsx`, `CoinGlassPanel.tsx`, `CryptoBubblesPanel.tsx`** | React wrapper components encapsulating external trading charts and heatmaps for the web dashboard interface. |
| **`lib/symbols.ts`** | **Pro-Grade Symbol Dictionary.** Contains mappings for 400+ cryptocurrency tickers to their exact CoinMarketCap slugs and Coinglass identifiers, preventing 404 errors during dynamic navigation. |
| **`lib/useSelectedSymbol.tsx`** | React Context and custom hook providing global symbol state synchronization across frontend components. |

### D. Documentation & Project Memory (`docs/`, `.agent/`, Root MDs)
| File Name | Role & Technical Description |
| :--- | :--- |
| **`docs/ARCHITECTURE.md`** | Authoritative system design document detailing WebContentsView layout, IPC protocols, and security boundaries. |
| **`NexusDesk_README.md` & `README.md`** | Public and developer documentation explaining features, setup instructions, and architecture. |
| **`llms.txt` & `memory.md`** | AI context indexing files and historical project memory tracking architectural decisions, bug fixes (e.g., TradingView unload fix), and technical debt. |
| **`multi-tab-workspace.md`, `next-features.md`, `perpetual-tab-fixes.md`** | Historical implementation plans and feature roadmaps tracking tab persistence and futures auto-open mechanics. |

---

## 3. How to Scale the Project (Enterprise & Pro Roadmap)

As your trading volume, watchlist size, and analytical needs grow, NexusDesk can be scaled across four critical technical dimensions:

```
+-----------------------------------------------------------------------------------+
|                        SCALING DIMENSIONS & ARCHITECTURE                          |
+-----------------------------------------------------------------------------------+
| 1. ARCHITECTURAL | • Replace IPC polling with Local WebSocket / gRPC Daemon       |
|    & IPC BUS     | • Use Redis Pub/Sub for high-frequency tick data distribution    |
+------------------+----------------------------------------------------------------+
| 2. DATA STORAGE  | • Migrate SQLite to WAL Mode or DuckDB / TimescaleDB           |
|    & BACKTESTING | • Build automated OHLCV historical candle archiving            |
+------------------+----------------------------------------------------------------+
| 3. FRONTEND &    | • Compile React Micro-Frontends as local Electron static assets  |
|    UI RENDERING  | • Offload sparkline math to Web Workers & OffscreenCanvas      |
+------------------+----------------------------------------------------------------+
| 4. AI & TRADING  | • Multi-Agent Consensus (Deep Research + Quick Sentiment)      |
|    EXECUTION     | • Automated Webhook Alerts & Telegram/Discord Push Notifications |
+------------------+----------------------------------------------------------------+
```

### A. Architectural & IPC Bus Scaling
- **Current Bottleneck**: Polling 500+ funding rates and ticker updates via CCXT directly inside `market-intel.cjs` and sending large JSON payloads over Electron IPC can cause main-thread latency.
- **Scaling Solution**: Extract `market-intel.cjs` into a standalone local **gRPC or WebSocket Background Daemon** running on a separate port (e.g., `localhost:45000`). The Electron renderer processes connect directly to this daemon via WebSockets. This removes heavy networking and CCXT serialization from the Electron main process, allowing 1,000+ coins to be monitored concurrently without UI stutter.

### B. Database & Analytical Storage Scaling
- **Current Bottleneck**: Standard SQLite (`better-sqlite3`) is optimized for simple transaction logging and portfolio snapshots, but struggles with high-frequency tick archiving or heavy backtesting queries.
- **Scaling Solution**: 
  1. Enable **SQLite WAL (Write-Ahead Logging) mode** and `PRAGMA synchronous = NORMAL;` immediately for a 5x read/write concurrency boost.
  2. For pro-grade quantitative scaling, integrate **DuckDB** or local **TimescaleDB** alongside SQLite. DuckDB can ingest millions of OHLCV candle rows in milliseconds, enabling instant client-side backtesting of arbitrage spreads and funding rate squeeze strategies directly inside the app.

### C. UI Rendering & Frontend Scaling
- **Current Bottleneck**: Electron panels currently use vanilla HTML/CSS (`market-intel-ui.html`, `ai-chat.html`). While lightweight, managing complex state (like multi-tab watchlist filtering and sorting) in vanilla JS becomes difficult to maintain.
- **Scaling Solution**: Transition all Electron bottom panels to **React / Next.js static micro-frontends**. By compiling Next.js components to static HTML/JS bundles (`output: 'export'`) and loading them locally via `file://` protocol in Electron, you gain React 19's concurrent rendering, Tailwind CSS v4 design tokens, and modular state management without sacrificing native desktop performance.
- Use **Web Workers** and **OffscreenCanvas** for rendering Chart.js 12-hour funding rate sparklines off the main UI thread.

### D. AI Co-Pilot & Trading Execution Scaling
- **Current Bottleneck**: Single-prompt Gemini AI queries with static context injection.
- **Scaling Solution**:
  1. **Multi-Agent Consensus Architecture**: Implement a dual-model system where a lightweight fast model (e.g., Gemini Flash) handles instant chat UI responses, while a deeper reasoning model (e.g., Gemini Pro or specialized quantitative agent) runs asynchronously in the background to analyze 24-hour arbitrage spreads and generate structured trade proposals.
  2. **Automated Webhook & Alert Dispatcher**: Add an alerting engine that pushes extreme squeeze radar notifications ($> \pm0.7\%$ funding spikes) directly to Telegram bots, Discord webhooks, or mobile push services when you are away from your desk.

---

## 4. How to Start and Run the Project

NexusDesk is designed for rapid setup on Windows environments.

### Prerequisites
- **Operating System**: Windows 10 or Windows 11 (Required for Windows DPAPI OS-level vault encryption).
- **Node.js**: Version 18.0.0 or higher ([Download Node.js](https://nodejs.org/)).
- **Git**: Installed and available in PATH.

### A. One-Click Quick Launch (Recommended)
1. Open your project folder in Windows Explorer: `d:\[Project]\crypto-dashboard`.
2. Double-click **`start.bat`**.
3. A green terminal menu will appear:
   - Type **`1`** and press Enter to launch the **Electron Desktop Command Center**. (If this is your first run, the script will automatically run `npm install` before launching).
   - Type **`2`** and press Enter to launch the **Next.js Web Dashboard** server on `http://localhost:3000`.

### B. Manual Command Line Launch
Open PowerShell or Command Prompt inside `d:\[Project]\crypto-dashboard`:

```powershell
# 1. Install all dependencies
npm install

# 2. Launch Electron Desktop Command Center (Production Mode)
npm run desktop

# 3. OR Launch Next.js Web Dashboard (Development Mode)
npm run dev

# 4. OR Run ESLint Code Verification
npm run lint
```

### C. Building Standalone Windows Executable (.exe)
To package NexusDesk as an installable Windows desktop application to share or deploy:

```powershell
# Install electron-builder tooling
npm install electron-builder --save-dev

# Build standalone Windows installer
npm run build
```
When compilation completes, the installer will be available inside the `dist/` directory as `NexusDesk Setup 1.0.0.exe`.

### D. Post-Launch Vault Configuration
Upon launching the desktop application, click the **Vault** icon in the top control bar and enter your API keys. **Do not create a `.env` file for secrets**—NexusDesk stores them securely in `%AppData%\NexusDesk\hub-keys.json` encrypted via Windows DPAPI.

---

## 5. Developer Modification Guide (How to Change Codes Safely)

When modifying NexusDesk, you must respect the multi-process Chromium architecture and IPC security boundaries. Here is the exact guide on how to change features without breaking system stability.

### A. Modifying UI, Layouts & Colors
- **Top Control Bar & Tabs**: Edit `electron/control.html`. This file controls the tab bar, search input, and navigation buttons.
- **Squeeze Radar & Watchlist Table**: Edit `electron/market-intel-ui.html`. To modify sparkline colors or chart dimensions, update the Chart.js configuration objects inside `<script>` tags.
- **AI Chat & Market Pulse**: Edit `electron/ai-chat.html`. You can customize the styling of AI responses, market badges, and trade confirmation modals here.
- **Next.js Web Dashboard**: Edit `app/globals.css` for design tokens and `components/DashboardShell.tsx` for layout adjustments.
- **Design Rule**: Always adhere to the established **Glassmorphism Dark Mode** aesthetic. Use HSL/Hex dark slates (`#0f172a`, `#1e293b`), vibrant cyan/emerald accents for bullish metrics, and rose/crimson accents for bearish metrics.

### B. Adding New Cryptocurrencies & Symbol Mappings
If a coin shows a 404 error on CoinMarketCap or Coinglass:
1. Open **`lib/symbols.ts`**.
2. Add the ticker and slug to the dictionary:
   ```typescript
   export const SYMBOL_SLUGS: Record<string, { cmc: string; coinglass?: string }> = {
     // ... existing symbols
     "NEWCOIN": { cmc: "official-cmc-slug", coinglass: "NEWCOIN" },
   };
   ```
3. If working in the Electron backend, also check **`electron/market-intel.cjs`** inside the `resolveCmcSlug(ticker)` function to ensure fallback rules or custom resolvers match your new symbol.

### C. Adding New CCXT Exchanges
To add support for a new cryptocurrency exchange (e.g., Kraken, Bybit, KuCoin):
1. Open **`electron/main.cjs`** and locate exchange initialization in the CCXT handler.
2. Open **`electron/market-intel.cjs`** and locate the `fetchFundingRates()` / `fetchWatchlistData()` functions.
3. Instantiate the new CCXT exchange class:
   ```javascript
   const bybit = new ccxt.bybit({
     enableRateLimit: true,
     // Keys are loaded dynamically from DPAPI vault via IPC
   });
   ```
4. Ensure the exchange selector in **`electron/control.html`** and **`components/SymbolSearch.tsx`** includes `<option value="bybit">Bybit</option>`.

### D. Enhancing AI Co-Pilot Capabilities & Prompts
To give Gemini AI more context about the market or your trading strategies:
1. Open **`electron/main.cjs`** and find the `ipcMain.handle('ai-chat-prompt', ...)` handler.
2. Modify the system prompt string to inject additional market intel (such as open interest, funding rate heatmaps, or technical RSI/MACD values fetched from `market-intel.cjs`):
   ```javascript
   const systemPrompt = `You are NexusDesk AI Co-Pilot.
   Current Active Portfolio Balance: ${portfolioBalance} USD.
   BTC Dominance: ${btcDominance}%. Fear & Greed: ${fearGreed}.
   NEW CONTEXT: Active Squeeze Radar Alerts: ${JSON.stringify(activeSqueezeAlerts)}.
   Provide sharp, professional, risk-aware quantitative trading analysis.`;
   ```

### E. Critical Safety Rules & Pitfalls to Avoid
> [!CAUTION]
> **NEVER Remove TradingView `will-prevent-unload` Override in `main.cjs`**  
> TradingView's embedded web widget registers aggressive `beforeunload` event handlers. If you modify window creation in `electron/main.cjs` and accidentally remove the `webContents.on('will-prevent-unload', ...)` interceptor, clicking any indicator on the TradingView chart will permanently freeze symbol searching and tab switching across the entire application.

> [!WARNING]
> **NEVER Write API Keys to `.env` or Plain Text Files**  
> Always route API key save/load operations through `electron/portfolio.cjs` using `safeStorage.encryptString()` and `safeStorage.decryptString()`. Never commit plain-text API keys or bypass Windows DPAPI encryption.

> [!IMPORTANT]
> **Always Test Multi-Tab State Synchronization**  
> When adding new state variables (like custom timeframe selectors or indicator toggles), ensure you update the `workspaceTabs` array schema in `electron/main.cjs` and broadcast changes via the `symbol-changed` IPC event so that switching tabs preserves user state cleanly.

---

## 6. Verification & Audit Commands

After making any code changes, run the following verification checklist to guarantee production readiness:

```powershell
# 1. Verify TypeScript compilation and Next.js linting
npm run lint

# 2. Test CCXT Exchange API connectivity and funding rate fetching
node electron/test-ccxt.js
node electron/test-funding.js
node electron/test-oi.js

# 3. Launch Electron Command Center and verify multi-tab switching
npm run desktop
```
