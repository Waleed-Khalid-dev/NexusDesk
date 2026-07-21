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
});
