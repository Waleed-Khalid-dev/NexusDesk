const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hub", {
  getState: () => ipcRenderer.invoke("get-state"),
  setSymbol: (payload) => ipcRenderer.send("set-symbol", payload),
  toggleLeft: () => ipcRenderer.send("toggle-left"),
  toggleRight: () => ipcRenderer.send("toggle-right"),
  reloadPane: (pane) => ipcRenderer.send("reload-pane", pane),
  navigatePane: (pane) => ipcRenderer.send("navigate-pane", pane),
  setLayout: (layout) => ipcRenderer.send("set-layout", layout),
  resetLayout: () => ipcRenderer.send("reset-layout"),
  startResize: (side, screenX, screenY) =>
    ipcRenderer.send("start-resize", { side, screenX, screenY }),
  resizeTo: (screenX, screenY) => ipcRenderer.send("resize-to", { screenX, screenY }),
  endResize: () => ipcRenderer.send("end-resize"),
  cmcToggle: () => ipcRenderer.send("cmc-toggle"),
  openPortfolio: () => ipcRenderer.send("open-portfolio"),
  toggleAi: () => ipcRenderer.send("toggle-ai"),
  cmcTab: (tab) => ipcRenderer.send("cmc-tab", tab),
  openArbitrage: () => ipcRenderer.send("open-arbitrage"),
  onState: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("symbol-changed", handler);
    return () => ipcRenderer.removeListener("symbol-changed", handler);
  },
  openMarketIntel: () => ipcRenderer.send("open-market-intel"),
  createTab: (payload) => ipcRenderer.send("create-tab", payload),
  switchTab: (tabId) => ipcRenderer.send("switch-tab", tabId),
  closeTab: (tabId) => ipcRenderer.send("close-tab", tabId),
  renameTab: (payload) => ipcRenderer.send("rename-tab", payload),
  addWatchlist: (coin) => ipcRenderer.send("add-watchlist", coin),
  removeWatchlist: (coin) => ipcRenderer.send("remove-watchlist", coin),
  pinRecent: (coin) => ipcRenderer.send("pin-recent", coin),
  setWatchlistDrawerOpen: (isOpen) => ipcRenderer.send("set-watchlist-drawer-open", isOpen),
  onTabLimitReached: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("tab-limit-reached", handler);
    return () => ipcRenderer.removeListener("tab-limit-reached", handler);
  },
  showContextMenu: () => ipcRenderer.send("show-context-menu"),
  getPendingTrades: () => ipcRenderer.invoke("get-pending-trades"),
  getFirstPendingTrade: () => ipcRenderer.invoke("get-first-pending-trade"),
  submitJournalEnrichment: (data) => ipcRenderer.send("submit-journal-enrichment", data),
  testInjectTrade: () => ipcRenderer.invoke("test-inject-trade"),
  openJournalModal: () => ipcRenderer.send("open-journal-modal"),
  openJournalDashboard: () => ipcRenderer.send("open-journal-dashboard"),
  getTrades: () => ipcRenderer.invoke("get-trades")
});

