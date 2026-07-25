# Feature Plan: Multi-Tab Workspace System (`multi-tab-workspace.md`)

> **Status:** ⏳ Draft / Awaiting Socratic Gate Review & User Approval  
> **Target:** NexusDesk / Crypto Hub Desktop  
> **Agent:** `frontend-specialist` (Control Bar UI) + `backend-specialist` (Electron Main IPC & WebContentsView State Manager)

---

## Overview

The **Multi-Tab Workspace System** brings browser/TradingView style multi-tab monitoring into NexusDesk. Instead of changing your single active coin view or launching multiple heavy Electron app windows, users can create, switch between, and manage multiple tabs right inside the top control bar (`control.html`).

Each tab retains its own active coin, exchange, panel configuration, and layout state. Switching tabs seamlessly updates all 4 active `WebContentsView` panes (CryptoBubbles, TradingView, Coinglass Heatmap, and CoinMarketCap/Market Intel) to that tab's coin without destroying app performance or losing context.

---

## 🛑 Socratic Gate & Clarifying Questions

Before proceeding with code execution, please review these key trade-off choices:

> [!IMPORTANT]
> **Question 1: Tab Navigation Behavior**
> When switching tabs (e.g. from `ACE` to `BTC`), should the app:
> - **Option A (Instant Lightweight Navigation):** Update the URL of all 4 panes (`TradingView`, `Coinglass`, `CMC`, `CryptoBubbles`) to the target tab's coin via IPC. Very fast, low memory footprint.
> - **Option B (Multi-View Swapping):** Keep separate `WebContentsView` instances alive per tab in the background and swap bounds. Instant zero-reload switching, but consumes more RAM per open tab.
> *Recommended: Option A (Lightweight Navigation + State Cache) as it maintains Electron performance while switching in ~300ms.*

> [!TIP]
> **Question 2: Tab Persistence**
> Should your open tabs (e.g., Tab 1: `ACE`, Tab 2: `SOL`, Tab 3: `BTC`) automatically save to `%AppData%\NexusDesk\hub-settings.json` so they automatically restore when you restart the application?

---

## Proposed Architectural Changes

### 1. Control Bar UI (`electron/control.html`)
- **Tab Bar Component:** Add a dark-mode, glassmorphism tab bar inside the empty header space (highlighted in the user screenshot).
- **Tab Elements:**
  - Active indicator pill with glowing accent border.
  - Exchange + Coin Badge (e.g. `[ MEXC : ACE ]`).
  - Close button `×` (hidden if only 1 tab exists).
  - Add New Tab button `+` with hover animations.
  - Double-click tab to rename (e.g., "Meme Coins", "BTC Macro").

### 2. Main Process State Engine (`electron/main.cjs`)
- **Tab State Registry:** Maintain an array of open tabs in `main.cjs`:
  ```javascript
  let workspaceTabs = [
    { id: 'tab-1', ticker: 'ACE', exchange: 'MEXC', label: 'ACE (MEXC)', active: true },
    { id: 'tab-2', ticker: 'SOL', exchange: 'BYBIT', label: 'SOL (BYBIT)', active: false }
  ];
  ```
- **IPC Handlers:**
  - `get-tabs`: Returns current tab list.
  - `create-tab`: Adds new tab, makes it active, and triggers `set-symbol`.
  - `switch-tab(tabId)`: Sets active tab, retrieves its coin/exchange, and updates all `WebContentsView` panes.
  - `close-tab(tabId)`: Removes tab and activates adjacent tab.
  - `rename-tab(tabId, newLabel)`: Updates custom label.

### 3. Synchronization & State Persistence (`electron/portfolio.cjs` / `hub-settings.json`)
- **Auto-Save:** Store `workspaceTabs` array in user settings so tabs persist across app restarts.
- **Search Integration:** Searching a new coin in the search bar updates the *currently active tab* rather than replacing the whole workspace.

---

## Implementation Workflow

```
[Phase 1: UI] Add Tab Bar to control.html & CSS styling
      ↓
[Phase 2: Main IPC] Add workspaceTabs registry & IPC event handlers in main.cjs
      ↓
[Phase 3: Sync] Connect search bar & ticker changes to active tab state
      ↓
[Phase 4: Persistence] Save & restore open tabs in hub-settings.json
      ↓
[Phase 5: Verification] Test tab creation, switching, closing, and cross-pane sync
```

---

## Verification Plan

### Manual Verification
1. **Create Tab:** Click `+` button in control bar $\rightarrow$ Verify new tab appears and displays default coin.
2. **Coin Search Sync:** Change coin to `SOL` on Tab 2 $\rightarrow$ Verify TradingView, Heatmap, CMC, and CryptoBubbles all load `SOL`.
3. **Switch Tab:** Click back to Tab 1 (`ACE`) $\rightarrow$ Verify all 4 panes immediately switch back to `ACE`.
4. **Close Tab:** Click `×` on Tab 2 $\rightarrow$ Verify Tab 2 closes and focus safely shifts to Tab 1.
5. **App Restart:** Close NexusDesk and reopen $\rightarrow$ Verify all open tabs and active states are restored from `hub-settings.json`.
