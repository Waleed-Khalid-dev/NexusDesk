/**
 * Desktop Crypto Hub — real browser panes (NOT iframes).
 * CoinGlass / TradingView login works because each pane is a top-level
 * Chromium WebContents, not a third-party iframe.
 */
const {
  app,
  BaseWindow,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  screen,
  safeStorage,
} = require("electron");
const path = require("path");
const fs = require("fs");
const marketIntel = require("./market-intel.cjs");

const TOP_H = 78;
const SPLIT_W = 6;
const LEFT_PCT = 0.22;
const RIGHT_PCT = 0.28;
const MIN_SIDE = 0.12;
const MAX_SIDE = 0.42;
const MIN_CENTER = 0.22;

/** @type {BaseWindow | null} */
let mainWindow = null;
/** @type {WebContentsView | null} */
let controlView = null;
/** @type {WebContentsView | null} */
let bubblesView = null;
/** @type {WebContentsView | null} */
let chartView = null;
/** @type {WebContentsView | null} */
let heatmapView = null;
/** @type {WebContentsView | null} */
let cmcView = null;
/** @type {WebContentsView | null} */
let aiView = null;
/** @type {WebContentsView | null} */
let leftSplit = null;
/** @type {WebContentsView | null} */
let rightSplit = null;
/** @type {WebContentsView | null} */
let cmcSplit = null;

let leftCollapsed = false;
let rightCollapsed = false;
let cmcPanelOpen = false;
let aiPanelOpen = false;
const AI_WIDTH = 320;
let cmcActiveTab = "market"; // "market" | "coin" | "community"
let cmcHeight = 380;
let leftPct = LEFT_PCT;
let rightPct = RIGHT_PCT;
let currentTicker = "BTC";
let currentExchange = "BINANCE";
let executionMode = false;

/** @type {{ side: 'left' | 'right' | 'bottom', startX?: number, startY?: number, startLeft?: number, startRight?: number, startCmcHeight?: number } | null} */
let drag = null;

const TOP_COINS = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "BNB",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "DOT",
  "SUI",
  "PEPE",
];

function settingsPath() {
  return path.join(app.getPath("userData"), "hub-settings.json");
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    const data = JSON.parse(raw);
    if (typeof data.leftPct === "number") leftPct = clamp(data.leftPct, MIN_SIDE, MAX_SIDE);
    if (typeof data.rightPct === "number")
      rightPct = clamp(data.rightPct, MIN_SIDE, MAX_SIDE);
    if (typeof data.leftCollapsed === "boolean") leftCollapsed = data.leftCollapsed;
    if (typeof data.rightCollapsed === "boolean")
      rightCollapsed = data.rightCollapsed;
    if (typeof data.ticker === "string" && data.ticker.trim())
      currentTicker = data.ticker.toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTC";
    if (typeof data.exchange === "string" && data.exchange.trim())
      currentExchange = data.exchange.toUpperCase().replace(/[^A-Z0-9]/g, "") || "BINANCE";
    if (typeof data.executionMode === "boolean") executionMode = data.executionMode;
    enforceCenterMin();
  } catch {
    /* first run */
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(
      settingsPath(),
      JSON.stringify(
        {
          leftPct,
          rightPct,
          leftCollapsed,
          rightCollapsed,
          ticker: currentTicker,
          exchange: currentExchange,
          executionMode,
        },
        null,
        2
      )
    );
  } catch {
    /* ignore */
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function enforceCenterMin() {
  // Keep center usable when both sides expanded
  const maxSides = 1 - MIN_CENTER;
  if (leftPct + rightPct > maxSides) {
    const scale = maxSides / (leftPct + rightPct);
    leftPct = clamp(leftPct * scale, MIN_SIDE, MAX_SIDE);
    rightPct = clamp(rightPct * scale, MIN_SIDE, MAX_SIDE);
  }
}

function tradingViewUrl(ticker, exchange) {
  const t = String(ticker || "BTC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const ex = String(exchange || "BINANCE").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `https://www.tradingview.com/chart/?symbol=${ex}:${t}USDT`;
}

function coinGlassUrl(ticker, exchange) {
  const t = String(ticker || "BTC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const ex = String(exchange || "BINANCE").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=${t}&exchange=${ex}`;
}

function bubblesUrl() {
  return "https://cryptobubbles.net/en";
}

/**
 * Map common tickers to CoinMarketCap URL slugs.
 * Unknown tickers fall back to lowercase (works for most altcoins).
 */
const CMC_SLUGS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "xrp",
  BNB: "binance-coin",
  DOGE: "dogecoin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  SUI: "sui",
  PEPE: "pepe",
  SHIB: "shiba-inu",
  MATIC: "matic-network",
  UNI: "uniswap",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  NEAR: "near-protocol",
  APT: "aptos",
  TRX: "tron",
  OP: "optimism",
  ARB: "arbitrum",
  ATOM: "cosmos",
  FTM: "fantom",
  INJ: "injective-protocol",
  SEI: "sei-network",
  WLD: "worldcoin-wld",
  IMX: "immutable-x",
  RUNE: "thorchain",
  FIL: "filecoin",
  ICP: "internet-computer",
  HBAR: "hedera-hashgraph",
  VET: "vechain",
  ETC: "ethereum-classic",
  AAVE: "aave",
  MKR: "maker",
  SNX: "synthetix-network-token",
  CRV: "curve-dao-token",
  JUP: "jupiter-ag",
  PYTH: "pyth-network",
  BONK: "bonk",
  WIF: "dogwifcoin",
};

function cmcSlug(ticker) {
  const t = String(ticker || "BTC").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CMC_SLUGS[t] || t.toLowerCase();
}

function cmcChartsUrl() {
  return "https://coinmarketcap.com/charts/";
}

function cmcCoinUrl(ticker) {
  return `https://coinmarketcap.com/currencies/${cmcSlug(ticker)}/`;
}

function createPaneView() {
  return new WebContentsView({
    webPreferences: {
      partition: "persist:crypto-hub",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
}

function createSplitterView(side) {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  view.webContents.loadFile(path.join(__dirname, "splitter.html"), {
    query: { side },
  });
  return view;
}

function layout() {
  if (!mainWindow) return;
  const { width, height } = mainWindow.getContentBounds();

  // Reserve bottom space for CMC panel when open
  const panelH = cmcPanelOpen ? cmcHeight : 0;
  const splitH = cmcPanelOpen ? SPLIT_W : 0;
  const bodyH = Math.max(0, height - TOP_H - panelH - splitH);

  if (controlView) {
    controlView.setBounds({ x: 0, y: 0, width, height: TOP_H });
  }

  // --- CMC Splitter and Panel ---
  if (cmcSplit) {
    if (cmcPanelOpen) {
      cmcSplit.setVisible(true);
      cmcSplit.setBounds({ x: 0, y: TOP_H + bodyH, width, height: SPLIT_W });
    } else {
      cmcSplit.setVisible(false);
      cmcSplit.setBounds({ x: 0, y: height, width, height: 0 });
    }
  }

  if (cmcView) {
    if (cmcPanelOpen) {
      cmcView.setVisible(true);
      cmcView.setBounds({ x: 0, y: TOP_H + bodyH + SPLIT_W, width, height: cmcHeight });
    } else {
      cmcView.setVisible(false);
      cmcView.setBounds({ x: 0, y: height, width, height: 0 });
    }
  }

  const aiW = aiPanelOpen ? AI_WIDTH : 0;
  const leftSplitW = leftCollapsed ? 0 : SPLIT_W;
  const rightSplitW = rightCollapsed ? 0 : SPLIT_W;
  const usable = Math.max(0, width - leftSplitW - rightSplitW - aiW);

  const l = leftCollapsed ? 0 : Math.round(usable * leftPct);
  const r = rightCollapsed ? 0 : Math.round(usable * rightPct);
  const c = Math.max(160, usable - l - r);

  let x = 0;

  if (bubblesView) {
    if (leftCollapsed) {
      bubblesView.setVisible(false);
      bubblesView.setBounds({ x: 0, y: TOP_H, width: 0, height: bodyH });
    } else {
      bubblesView.setVisible(true);
      bubblesView.setBounds({ x, y: TOP_H, width: l, height: bodyH });
      x += l;
    }
  }

  if (leftSplit) {
    if (leftCollapsed) {
      leftSplit.setVisible(false);
      leftSplit.setBounds({ x: 0, y: TOP_H, width: 0, height: bodyH });
    } else {
      leftSplit.setVisible(true);
      leftSplit.setBounds({ x, y: TOP_H, width: SPLIT_W, height: bodyH });
      x += SPLIT_W;
    }
  }

  if (chartView) {
    chartView.setVisible(true);
    chartView.setBounds({ x, y: TOP_H, width: c, height: bodyH });
    x += c;
  }

  if (rightSplit) {
    if (rightCollapsed) {
      rightSplit.setVisible(false);
      rightSplit.setBounds({ x: 0, y: TOP_H, width: 0, height: bodyH });
    } else {
      rightSplit.setVisible(true);
      rightSplit.setBounds({ x, y: TOP_H, width: SPLIT_W, height: bodyH });
      x += SPLIT_W;
    }
  }

  if (heatmapView) {
    if (rightCollapsed) {
      heatmapView.setVisible(false);
      heatmapView.setBounds({ x: 0, y: TOP_H, width: 0, height: bodyH });
    } else {
      heatmapView.setVisible(true);
      heatmapView.setBounds({ x, y: TOP_H, width: r, height: bodyH });
      x += r;
    }
  }

  if (aiView) {
    if (aiPanelOpen) {
      aiView.setVisible(true);
      aiView.setBounds({ x, y: TOP_H, width: aiW, height: bodyH });
    } else {
      aiView.setVisible(false);
      aiView.setBounds({ x: width, y: TOP_H, width: 0, height: bodyH });
    }
  }
}

function statePayload() {
  return {
    ticker: currentTicker,
    exchange: currentExchange,
    leftCollapsed,
    rightCollapsed,
    cmcPanelOpen,
    aiPanelOpen,
    cmcActiveTab,
    leftPct,
    rightPct,
    cmcHeight,
    quick: TOP_COINS,
  };
}

function broadcastState() {
  if (controlView) {
    controlView.webContents.send("symbol-changed", statePayload());
  }
}

function setSymbol(payload, { reload = true } = {}) {
  let ticker, exchange;
  if (typeof payload === "object" && payload !== null) {
    ticker = payload.ticker;
    exchange = payload.exchange;
  } else {
    ticker = payload;
    exchange = currentExchange;
  }

  const t = String(ticker || "BTC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "") || "BTC";
  const ex = String(exchange || "BINANCE")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "") || "BINANCE";

  currentTicker = t;
  currentExchange = ex;

  if (reload) {
    if (chartView) chartView.webContents.loadURL(tradingViewUrl(t, ex));
    if (heatmapView) heatmapView.webContents.loadURL(coinGlassUrl(t, ex));
    // Auto-navigate CMC when symbol changes
    if (cmcView && cmcActiveTab === "coin") {
      cmcView.webContents.loadURL(cmcCoinUrl(t));
    }
  }

  saveSettings();
  broadcastState();
}

function createWindow() {
  loadSettings();

  mainWindow = new BaseWindow({
    width: 1680,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#09090b",
    title: "Crypto Hub Desktop",
    autoHideMenuBar: true,
  });

  controlView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  controlView.webContents.loadFile(path.join(__dirname, "control.html"));

  bubblesView = createPaneView();
  chartView = createPaneView();
  heatmapView = createPaneView();
  cmcView = createPaneView();
  
  aiView = new WebContentsView({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  aiView.webContents.loadFile(path.join(__dirname, "ai-chat.html"));

  leftSplit = createSplitterView("left");
  rightSplit = createSplitterView("right");
  cmcSplit = createSplitterView("bottom");

  for (const view of [bubblesView, chartView, heatmapView, cmcView]) {
    view.webContents.setWindowOpenHandler(() => ({
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 520,
        height: 720,
        autoHideMenuBar: true,
        webPreferences: {
          partition: "persist:crypto-hub",
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    }));
  }

  // z-order: panes first, splitters on top so drag works
  // cmcView goes between panes and splitters so splitters stay on top
  mainWindow.contentView.addChildView(controlView);
  mainWindow.contentView.addChildView(bubblesView);
  mainWindow.contentView.addChildView(chartView);
  mainWindow.contentView.addChildView(heatmapView);
  mainWindow.contentView.addChildView(cmcView);
  mainWindow.contentView.addChildView(aiView);
  mainWindow.contentView.addChildView(leftSplit);
  mainWindow.contentView.addChildView(rightSplit);
  mainWindow.contentView.addChildView(cmcSplit);

  bubblesView.webContents.loadURL(bubblesUrl());
  chartView.webContents.loadURL(tradingViewUrl(currentTicker, currentExchange));
  heatmapView.webContents.loadURL(coinGlassUrl(currentTicker, currentExchange));
  // Load CMC charts page by default (shown when user opens the panel)
  cmcView.webContents.loadURL(cmcChartsUrl());

  layout();
  mainWindow.on("resize", layout);

  controlView.webContents.on("did-finish-load", () => {
    broadcastState();
  });

  mainWindow.on("closed", () => {
    saveSettings();
    mainWindow = null;
    controlView = null;
    bubblesView = null;
    chartView = null;
    heatmapView = null;
    cmcView = null;
    leftSplit = null;
    rightSplit = null;
    cmcSplit = null;
  });

  controlView.webContents.on("before-input-event", (_event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === "i") {
      controlView.webContents.openDevTools({ mode: "detach" });
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BaseWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  saveSettings();
});

ipcMain.handle("get-state", () => statePayload());

ipcMain.on("set-symbol", (_e, payload) => {
  setSymbol(payload);
});

ipcMain.on("toggle-left", () => {
  leftCollapsed = !leftCollapsed;
  layout();
  saveSettings();
  broadcastState();
});

ipcMain.on("toggle-right", () => {
  rightCollapsed = !rightCollapsed;
  layout();
  saveSettings();
  broadcastState();
});

ipcMain.on("set-layout", (_e, payload) => {
  if (!payload || typeof payload !== "object") return;
  if (typeof payload.leftPct === "number" && !leftCollapsed) {
    leftPct = clamp(payload.leftPct, MIN_SIDE, MAX_SIDE);
  }
  if (typeof payload.rightPct === "number" && !rightCollapsed) {
    rightPct = clamp(payload.rightPct, MIN_SIDE, MAX_SIDE);
  }
  enforceCenterMin();
  layout();
  saveSettings();
  broadcastState();
});

ipcMain.on("reset-layout", () => {
  leftPct = LEFT_PCT;
  rightPct = RIGHT_PCT;
  leftCollapsed = false;
  rightCollapsed = false;
  cmcPanelOpen = false;
  cmcHeight = 380;
  layout();
  saveSettings();
  broadcastState();
});

ipcMain.on("start-resize", (_e, { side, screenX, screenY }) => {
  drag = {
    side,
    startX: screenX,
    startY: screenY,
    startLeft: leftPct,
    startRight: rightPct,
    startCmcHeight: cmcHeight,
  };
});

ipcMain.on("resize-to", (_e, { screenX, screenY }) => {
  if (!drag || !mainWindow) return;

  const { width, height } = mainWindow.getContentBounds();
  
  if (drag.side === "bottom") {
    // For bottom resize, the mouse moves up to make panel taller (negative deltaY).
    const dy = screenY - drag.startY;
    let newH = drag.startCmcHeight - dy;
    
    // Limits: min 150px, max (window height - TOP_H - 100px)
    newH = Math.max(150, Math.min(newH, height - TOP_H - 100));
    
    cmcHeight = newH;
    layout();
    return;
  }

  const bounds = mainWindow.getContentBounds();
  // Convert screenX to content-local X
  const display = screen.getDisplayMatching(bounds);
  void display;
  const contentX = screenX - bounds.x;
  const usableWidth = bounds.width;
  const leftSplitW = leftCollapsed ? 0 : SPLIT_W;
  const rightSplitW = rightCollapsed ? 0 : SPLIT_W;
  const usable = Math.max(1, width - leftSplitW - rightSplitW);

  if (drag.side === "left") {
    // contentX is approximately left edge + left width + half splitter
    const next = clamp(contentX / usable, MIN_SIDE, MAX_SIDE);
    // leave room for right + center
    const maxLeft = 1 - rightPct - MIN_CENTER;
    leftPct = clamp(next, MIN_SIDE, Math.min(MAX_SIDE, maxLeft));
  } else {
    // right edge starts at (1 - rightPct) of usable, plus splits
    const fromRight = (width - contentX) / usable;
    const next = clamp(fromRight, MIN_SIDE, MAX_SIDE);
    const maxRight = 1 - leftPct - MIN_CENTER;
    rightPct = clamp(next, MIN_SIDE, Math.min(MAX_SIDE, maxRight));
  }
  layout();
  broadcastState();
});

ipcMain.on("end-resize", () => {
  if (!drag) return;
  drag = null;
  saveSettings();
  broadcastState();
});

ipcMain.on("reload-pane", (_e, pane) => {
  if (pane === "bubbles" && bubblesView) bubblesView.webContents.reload();
  if (pane === "chart" && chartView) chartView.webContents.reload();
  if (pane === "heatmap" && heatmapView) heatmapView.webContents.reload();
  if (pane === "cmc" && cmcView) cmcView.webContents.reload();
});

ipcMain.on("navigate-pane", (_e, pane) => {
  if (pane === "bubbles" && bubblesView) {
    bubblesView.webContents.loadURL(bubblesUrl());
  }
  if (pane === "chart" && chartView) {
    chartView.webContents.loadURL(tradingViewUrl(currentTicker, currentExchange));
  }
  if (pane === "heatmap" && heatmapView) {
    heatmapView.webContents.loadURL(coinGlassUrl(currentTicker, currentExchange));
  }
});

// --- CMC Panel IPC ---

ipcMain.on("cmc-toggle", () => {
  cmcPanelOpen = !cmcPanelOpen;
  layout();
  broadcastState();
});

ipcMain.on("cmc-tab", (_e, tab) => {
  if (!cmcView) return;
  cmcActiveTab = tab;
  
  if (tab === "market") {
    cmcView.webContents.loadURL(cmcChartsUrl());
  } else if (tab === "coin") {
    cmcView.webContents.loadURL(cmcCoinUrl(currentTicker));
  }
  
  broadcastState();
});

ipcMain.on("toggle-ai", () => {
  aiPanelOpen = !aiPanelOpen;
  layout();
  broadcastState();
});

// --- Portfolio Vault & API Keys ---
function keysPath() {
  return path.join(app.getPath("userData"), "hub-keys.json");
}

function loadKeys() {
  try {
    if (!fs.existsSync(keysPath())) return {};
    const raw = fs.readFileSync(keysPath(), "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveKeys(data) {
  fs.writeFileSync(keysPath(), JSON.stringify(data, null, 2));
}

// ─── Trading Safety Settings ───────────────────────────────────────────────
const DEFAULT_MAX_POSITION_USD = 50;
let maxPositionUSD = DEFAULT_MAX_POSITION_USD;

ipcMain.handle("get-trading-settings", () => {
  return { maxPositionUSD, defaultMaxPositionUSD: DEFAULT_MAX_POSITION_USD };
});

ipcMain.handle("set-max-position", (_e, value) => {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed <= 0) return { success: false, error: "Invalid value. Must be a positive number." };
  maxPositionUSD = parsed;
  return { success: true, maxPositionUSD };
});

ipcMain.handle("get-execution-mode", () => executionMode);

ipcMain.handle("set-execution-mode", (_e, value) => {
  executionMode = !!value;
  saveSettings();
  return { success: true, executionMode };
});

ipcMain.handle("execute-trade", async (_e, payload) => {
  try {
    if (!executionMode) throw new Error("Execution Mode is currently disabled in the Vault.");
    
    const { exchange: exId, symbol, side, type, amount } = payload;
    if (!exId || !symbol || !side || !type || !amount) {
      throw new Error("Missing required trade parameters in payload.");
    }
    
    const ccxt = require("ccxt");
    const keys = loadKeys();
    const creds = keys[exId];
    if (!creds || !creds.key || !creds.secret) {
      throw new Error(`No API keys found for exchange ${exId}.`);
    }

    const { safeStorage } = require("electron");
    const k = safeStorage.decryptString(Buffer.from(creds.key, "base64"));
    const s = safeStorage.decryptString(Buffer.from(creds.secret, "base64"));
    const exchange = new ccxt[exId]({ apiKey: k, secret: s, enableRateLimit: true });

    // Server-side max position validation
    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last;
    if (!price) throw new Error("Failed to fetch current price for " + symbol);
    
    const usdValue = price * amount;
    if (usdValue > maxPositionUSD) {
      throw new Error(`Trade value ($${usdValue.toFixed(2)}) exceeds maximum allowed position size ($${maxPositionUSD}). Trade blocked server-side.`);
    }

    // Execute the trade
    const order = await exchange.createOrder(symbol, type, side, amount);
    return { success: true, orderId: order.id, usdValue: usdValue.toFixed(2) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Arbitrage Scanner ─────────────────────────────────────────────────────
ipcMain.on("open-arbitrage", () => {
  const win = new BrowserWindow({
    width: 820,
    height: 600,
    title: "Arbitrage Scanner",
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile(path.join(__dirname, "arbitrage.html"));
});

ipcMain.handle("scan-arbitrage", async (_e, ticker) => {
  const keys = loadKeys();
  const exchangeIds = Object.keys(keys).filter(k => k !== "gemini");
  if (exchangeIds.length === 0) return { success: false, error: "No exchanges connected. Add API keys in the Vault." };

  const ccxt = require("ccxt");
  const symbol = ticker.toUpperCase().includes("/") ? ticker.toUpperCase() : `${ticker.toUpperCase()}/USDT`;

  const results = await Promise.allSettled(
    exchangeIds.map(async (exId) => {
      if (!ccxt[exId]) return null;
      try {
        const k = safeStorage.decryptString(Buffer.from(keys[exId].key, "base64"));
        const s = safeStorage.decryptString(Buffer.from(keys[exId].secret, "base64"));
        const exchange = new ccxt[exId]({ apiKey: k, secret: s, enableRateLimit: true });
        const ticker_data = await exchange.fetchTicker(symbol);
        return {
          exchange: exId.toUpperCase(),
          bid: ticker_data.bid,
          ask: ticker_data.ask,
          last: ticker_data.last,
          spread: ticker_data.ask && ticker_data.bid ? ((ticker_data.ask - ticker_data.bid) / ticker_data.bid * 100) : null,
        };
      } catch (e) {
        return { exchange: exId.toUpperCase(), error: e.message };
      }
    })
  );

  const rows = results
    .filter(r => r.status === "fulfilled" && r.value !== null)
    .map(r => r.value);

  // Calculate cross-exchange spread opportunity
  const valid = rows.filter(r => !r.error && r.bid && r.ask);
  let opportunity = null;
  if (valid.length >= 2) {
    const maxBid = valid.reduce((a, b) => (a.bid > b.bid ? a : b));
    const minAsk = valid.reduce((a, b) => (a.ask < b.ask ? a : b));
    const crossSpread = ((maxBid.bid - minAsk.ask) / minAsk.ask) * 100;
    if (maxBid.exchange !== minAsk.exchange) {
      opportunity = {
        buyOn: minAsk.exchange,
        buyAt: minAsk.ask,
        sellOn: maxBid.exchange,
        sellAt: maxBid.bid,
        spreadPct: crossSpread.toFixed(4),
        profitable: crossSpread > 0,
      };
    }
  }

  return { success: true, symbol, rows, opportunity };
});

ipcMain.handle("scan-top-arbitrage", async (_e, mode) => {
  const keys = loadKeys();
  const exchangeIds = Object.keys(keys).filter(k => k !== "gemini");
  if (exchangeIds.length < 2) {
    return { success: false, error: "Multi-coin arbitrage requires at least 2 connected exchanges. Add more keys in the Vault." };
  }

  const ccxt = require("ccxt");
  
  // Fetch all tickers from all connected exchanges
  const fetchResults = await Promise.allSettled(
    exchangeIds.map(async (exId) => {
      if (!ccxt[exId]) return null;
      try {
        const k = safeStorage.decryptString(Buffer.from(keys[exId].key, "base64"));
        const s = safeStorage.decryptString(Buffer.from(keys[exId].secret, "base64"));
        const exchange = new ccxt[exId]({ apiKey: k, secret: s, enableRateLimit: true });
        
        // Some exchanges require specific params or don't support fetchTickers fully, but most major ones do.
        const tickers = await exchange.fetchTickers();
        return { exchange: exId.toUpperCase(), tickers };
      } catch (e) {
        console.error(`Failed fetching tickers for ${exId}:`, e);
        return { exchange: exId.toUpperCase(), error: e.message };
      }
    })
  );

  const successfulFetches = fetchResults
    .filter(r => r.status === "fulfilled" && r.value && !r.value.error)
    .map(r => r.value);

  if (successfulFetches.length < 2) {
    return { success: false, error: "Failed to fetch data from enough exchanges. Check API keys and network." };
  }

  // Aggregate by symbol (only USDT pairs)
  const symbolsMap = {}; // { 'BTC/USDT': { binance: {bid, ask, pct}, mexc: {...} } }
  
  for (const { exchange, tickers } of successfulFetches) {
    for (const [symbol, data] of Object.entries(tickers)) {
      if (!symbol.endsWith("/USDT") || !data.bid || !data.ask) continue;
      
      if (!symbolsMap[symbol]) symbolsMap[symbol] = {};
      symbolsMap[symbol][exchange] = {
        bid: data.bid,
        ask: data.ask,
        last: data.last,
        percentage: data.percentage || 0
      };
    }
  }

  const opportunities = [];

  for (const [symbol, exchData] of Object.entries(symbolsMap)) {
    const exchanges = Object.keys(exchData);
    if (exchanges.length < 2) continue; // Need at least 2 for arbitrage

    let maxBid = -Infinity;
    let maxBidEx = "";
    let minAsk = Infinity;
    let minAskEx = "";
    
    // Average 24h change across exchanges for sorting
    let totalPct = 0;

    for (const ex of exchanges) {
      const d = exchData[ex];
      totalPct += d.percentage;
      if (d.bid > maxBid) { maxBid = d.bid; maxBidEx = ex; }
      if (d.ask < minAsk) { minAsk = d.ask; minAskEx = ex; }
    }

    const avgPct = totalPct / exchanges.length;
    const spreadPct = ((maxBid - minAsk) / minAsk) * 100;

    opportunities.push({
      symbol,
      buyOn: minAskEx,
      buyAt: minAsk,
      sellOn: maxBidEx,
      sellAt: maxBid,
      spreadPct,
      profitable: spreadPct > 0,
      change24h: avgPct,
      exchangeCount: exchanges.length
    });
  }

  // Sort by mode
  if (mode === 'gainers') {
    opportunities.sort((a, b) => b.change24h - a.change24h);
  } else if (mode === 'losers') {
    opportunities.sort((a, b) => a.change24h - b.change24h);
  } else {
    // Default to largest spread
    opportunities.sort((a, b) => b.spreadPct - a.spreadPct);
  }

  return { success: true, mode, opportunities: opportunities.slice(0, 100) };
});

ipcMain.on("open-portfolio", () => {
  const win = new BrowserWindow({
    width: 650,
    height: 700,
    title: "Command Center Vault",
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile(path.join(__dirname, "portfolio.html"));
});

ipcMain.handle("save-api-key", (_e, exchange, apiKey, apiSecret) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: "OS Encryption not available" };
    }
    const keys = loadKeys();
    keys[exchange] = {
      key: safeStorage.encryptString(apiKey).toString("base64"),
      secret: safeStorage.encryptString(apiSecret).toString("base64")
    };
    saveKeys(keys);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("save-ai-key", (_e, apiKey) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { success: false, error: "OS Encryption not available" };
    }
    const keys = loadKeys();
    keys["gemini"] = {
      key: safeStorage.encryptString(apiKey).toString("base64"),
    };
    saveKeys(keys);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── CMC & LunarCrush Key Management ──────────────────────────────────────────
ipcMain.handle("save-cmc-key", (_e, apiKey) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { success: false, error: "OS Encryption not available" };
    const keys = loadKeys();
    keys["cmc"] = { key: safeStorage.encryptString(apiKey).toString("base64") };
    saveKeys(keys);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("save-lunarcrush-key", (_e, apiKey) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { success: false, error: "OS Encryption not available" };
    const keys = loadKeys();
    keys["lunarcrush"] = { key: safeStorage.encryptString(apiKey).toString("base64") };
    saveKeys(keys);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Market Intelligence IPC ───────────────────────────────────────────────────
ipcMain.handle("get-market-pulse", async () => {
  try {
    const keys = loadKeys();
    const cmcKey = keys["cmc"] ? safeStorage.decryptString(Buffer.from(keys["cmc"].key, "base64")) : null;
    const pulse = await marketIntel.getMarketPulse(cmcKey);
    return { success: true, pulse };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-coin-intelligence", async (_e, symbol) => {
  try {
    const keys = loadKeys();
    const cmcKey = keys["cmc"] ? safeStorage.decryptString(Buffer.from(keys["cmc"].key, "base64")) : null;
    if (!cmcKey) return { success: false, error: "No CoinMarketCap API key found in Vault." };
    const [coinData, socialData] = await Promise.all([
      marketIntel.fetchCMCCoin(symbol, cmcKey),
      marketIntel.fetchLunarCrushSocial(symbol),
    ]);
    return { success: true, coin: coinData, social: socialData };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("has-api-key", (_e, exchange) => {
  const keys = loadKeys();
  if (!exchange) {
    // If no exchange provided, default to checking gemini
    return { hasKey: !!keys["gemini"] };
  }
  return { hasKey: !!keys[exchange] };
});

ipcMain.handle("test-api-key", async (_e, exchangeId) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("OS Encryption unavailable");
    const keys = loadKeys();
    const creds = keys[exchangeId];
    if (!creds) throw new Error("No keys found for this exchange.");
    
    const apiKey = safeStorage.decryptString(Buffer.from(creds.key, "base64"));
    const apiSecret = safeStorage.decryptString(Buffer.from(creds.secret, "base64"));
    
    const ccxt = require("ccxt");
    if (!ccxt[exchangeId]) throw new Error("Unsupported exchange in ccxt: " + exchangeId);
    
    const exchange = new ccxt[exchangeId]({
      apiKey: apiKey,
      secret: apiSecret,
      enableRateLimit: true,
    });
    
    let mergedTotal = {};
    
    // Fetch Spot
    try {
      const spot = await exchange.fetchBalance({ type: 'spot' });
      for (const [coin, val] of Object.entries(spot.total || {})) {
        if (val > 0) mergedTotal[coin] = (mergedTotal[coin] || 0) + val;
      }
    } catch (e) { /* ignore spot error if any */ }
    
    // Fetch Futures (Swap)
    try {
      const swap = await exchange.fetchBalance({ type: 'swap' });
      for (const [coin, val] of Object.entries(swap.total || {})) {
        if (val > 0) mergedTotal[coin] = (mergedTotal[coin] || 0) + val;
      }
    } catch (e) { /* ignore swap error if any */ }

    if (Object.keys(mergedTotal).length === 0) {
      // fallback generic
      const generic = await exchange.fetchBalance();
      for (const [coin, val] of Object.entries(generic.total || {})) {
        if (val > 0) mergedTotal[coin] = val;
      }
    }

    return { success: true, assetCount: Object.keys(mergedTotal).length, balances: mergedTotal };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- AI Chat Logic ---
ipcMain.handle("get-ai-models", async () => {
  try {
    const keys = loadKeys();
    const aiCreds = keys["gemini"];
    if (!aiCreds) return { success: false, error: "No Gemini API Key found in Vault." };
    
    const aiKey = safeStorage.decryptString(Buffer.from(aiCreds.key, "base64"));
    
    const { net } = require('electron');
    return new Promise((resolve) => {
      const request = net.request(`https://generativelanguage.googleapis.com/v1beta/models?key=${aiKey}`);
      request.on('response', (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              resolve({ success: false, error: parsed.error.message });
              return;
            }
            
            // Filter models that support generateContent
            const validModels = (parsed.models || [])
              .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
              .map(m => ({
                id: m.name.replace('models/', ''),
                displayName: m.displayName || m.name.replace('models/', ''),
                version: m.version,
                description: m.description
              }));
              
            // Inject latest models manually if missing from standard query
            const latestModels = [
              { id: 'gemini-3.0-flash', displayName: 'Gemini 3.0 Flash', description: 'Latest ultra-fast model' },
              { id: 'gemini-3.0-pro', displayName: 'Gemini 3.0 Pro', description: 'Latest ultra-capable model' },
              { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', description: 'High-speed model' },
              { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', description: 'High-capability model' },
              { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', description: 'Standard fast model' },
              { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', description: 'Standard capable model' }
            ];
            
            for (const lm of latestModels) {
              if (!validModels.find(m => m.id === lm.id)) {
                validModels.push(lm);
              }
            }
            
            // Auto fallback option
            validModels.unshift({ 
              id: "latest-free-auto", 
              displayName: "Latest Free Model (Auto)", 
              description: "Automatically routes to the best free model available" 
            });
              
            resolve({ success: true, models: validModels });
          } catch (e) {
            resolve({ success: false, error: e.message });
          }
        });
      });
      request.on('error', (err) => resolve({ success: false, error: err.message }));
      request.end();
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle("chat-with-ai", async (_e, prompt, selectedModel = "latest-free-auto") => {
  try {
    const keys = loadKeys();
    const aiCreds = keys["gemini"];
    if (!aiCreds) throw new Error("No Gemini API Key found in Vault.");
    
    const aiKey = safeStorage.decryptString(Buffer.from(aiCreds.key, "base64"));
    
    // Fallback if 'latest-free-auto' is selected
    let actualModel = selectedModel;
    if (actualModel === "latest-free-auto") {
      actualModel = "gemini-1.5-flash"; // Known working free endpoint fallback
    }
    
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(aiKey);
    const model = genAI.getGenerativeModel({ model: actualModel });

    // Fetch live balance for context
    let portfolioCtx = "No connected exchange balance available.";
    const exchangeIds = Object.keys(keys).filter(k => k !== "gemini" && k !== "cmc" && k !== "lunarcrush");
    if (exchangeIds.length > 0) {
      try {
        const ccxt = require("ccxt");
        const balancePromises = exchangeIds.map(async (exId) => {
          try {
            const k = safeStorage.decryptString(Buffer.from(keys[exId].key, "base64"));
            const s = safeStorage.decryptString(Buffer.from(keys[exId].secret, "base64"));
            const exchange = new ccxt[exId]({ apiKey: k, secret: s, enableRateLimit: true });
            let mergedTotal = {};
            let errors = [];
            try {
              const spot = await exchange.fetchBalance({ type: 'spot' });
              for (const [coin, val] of Object.entries(spot.total || {})) {
                if (val > 0) mergedTotal[coin] = (mergedTotal[coin] || 0) + val;
              }
            } catch (e) { errors.push(`Spot Error: ${e.message}`); }
            try {
              const swap = await exchange.fetchBalance({ type: 'swap' });
              for (const [coin, val] of Object.entries(swap.total || {})) {
                if (val > 0) mergedTotal[coin] = (mergedTotal[coin] || 0) + val;
              }
            } catch (e) { errors.push(`Futures Error: ${e.message}`); }
            if (Object.keys(mergedTotal).length === 0) {
              try {
                const generic = await exchange.fetchBalance();
                for (const [coin, val] of Object.entries(generic.total || {})) {
                  if (val > 0) mergedTotal[coin] = val;
                }
              } catch (e) { errors.push(`Generic Error: ${e.message}`); }
            }
            const nonZero = Object.entries(mergedTotal);
            if (nonZero.length > 0) return `${exId.toUpperCase()}: ${nonZero.map(([c, a]) => `${c}=${a}`).join(", ")}`;
            else if (errors.length > 0) return `${exId.toUpperCase()}: (Empty or API Issue - ${errors.join(' | ')})`;
            return `${exId.toUpperCase()}: $0.00`;
          } catch (e) { return `${exId.toUpperCase()}: Init Error - ${e.message}`; }
        });
        const results = await Promise.all(balancePromises);
        const validResults = results.filter(r => r !== null);
        if (validResults.length > 0) portfolioCtx = validResults.join(" | ");
      } catch (e) {
        portfolioCtx = "Error loading balances: " + e.message;
      }
    }

    // Fetch live market intelligence (cached 15 min)
    let marketContext = "";
    try {
      const cmcKey = keys["cmc"] ? safeStorage.decryptString(Buffer.from(keys["cmc"].key, "base64")) : null;
      const pulse = await marketIntel.getMarketPulse(cmcKey);
      marketContext = marketIntel.buildAIContext(pulse);
    } catch (e) {
      console.warn("[AI] Market intelligence fetch failed:", e.message);
    }

    const executionInstruction = executionMode 
      ? `\n- EXECUTION MODE IS ON. You have permission to prepare trade execution commands if the user explicitly asks to buy, sell, or enter a position. You can prepare either an amount-wise trade or a percentage-wise trade based on the user's preference. Use Market orders for now.\n- To prepare a trade, you MUST output a JSON payload wrapped in <TRADE> tags at the very end of your response.\n- Format: <TRADE>{"exchange":"binance","symbol":"BTC/USDT","side":"buy","type":"market","amount":0.01}</TRADE>\n- Do not output the <TRADE> block unless the user explicitly requests a trade.`
      : `\n- EXECUTION MODE IS OFF. You are in read-only mode. If the user asks you to execute a trade, you MUST decline and inform them that execution mode is currently disabled in the Command Center Vault.`;

    const sysInstruction = `You are a professional crypto trading AI Co-Pilot integrated into a command center dashboard.
The user is currently viewing the chart for: ${currentTicker} on ${currentExchange}.
User's Live Portfolio Balance: ${portfolioCtx}

${marketContext}

Your role is to act as a highly intelligent, data-driven trading assistant. You use the live market intelligence above to ground your responses in real market conditions. You can calculate arbitrage opportunities, define stop-loss/take-profit (SL/TP) levels, analyze portfolio balances, rank coins by opportunity, and offer market insights.

When answering questions about market conditions, which coins to trade, or trade proposals — you MUST reference the Fear & Greed Index, Altcoin Season Index, and top mover data above to justify your reasoning. This makes your answers far more valuable than generic advice.

CRITICAL RULES:
- Be concise, highly professional, and data-driven.
- Keep answers brief (max 3 short paragraphs) but NEVER cut off mid-sentence.
- Format using **bolding** for key metrics and numbers.
- Do not hallucinate balances or market data. Only use the context provided above.${executionInstruction}`;

    const { HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
    
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: sysInstruction + "\n\nUser Prompt: " + prompt }] }
      ],
      safetySettings,
      generationConfig: { maxOutputTokens: 8192 }
    });

    return { success: true, text: result.response.text() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- Network Utils ---
ipcMain.handle('get-public-ip', async () => {
  try {
    const { net } = require('electron');
    return new Promise((resolve) => {
      const request = net.request('https://api.ipify.org?format=json');
      request.on('response', (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ success: true, ip: parsed.ip });
          } catch (e) {
            resolve({ success: false, error: e.message });
          }
        });
      });
      request.on('error', (err) => resolve({ success: false, error: err.message }));
      request.end();
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
});

