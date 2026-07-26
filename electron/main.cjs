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
  Notification
} = require("electron");
const path = require("path");
const fs = require("fs");
const marketIntel = require("./market-intel.cjs");
const portfolioService = require("./portfolio.cjs");

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
/** @type {Map<string, { chartView: WebContentsView, heatmapView: WebContentsView, cmcView: WebContentsView }>} */
const tabPanes = new Map();

function getActiveTabPanes() {
  return tabPanes.get(activeTabId) || null;
}

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
let aiWidth = 320;
let cmcActiveTab = "market"; // "market" | "coin" | "community"
let cmcHeight = 380;
let leftPct = LEFT_PCT;
let rightPct = RIGHT_PCT;
let currentTicker = "BTC";
let currentExchange = "BINANCE";
let currentMarketType = "PERP";
let executionMode = false;

let workspaceTabs = [
  { id: "tab-1", ticker: "BTC", exchange: "BINANCE", marketType: "PERP", label: "BINANCE: BTC" }
];
let activeTabId = "tab-1";

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

let watchlist = [
  "BTC", "ETH", "SOL", "VET", "TAO", "XRP", "BNB", "DOGE", "ADA", "AVAX"
];
let recentCoins = [];
let watchlistDrawerOpen = false;

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
    if (typeof data.aiWidth === "number") aiWidth = clamp(data.aiWidth, 260, 800);

    if (Array.isArray(data.workspaceTabs) && data.workspaceTabs.length > 0) {
      workspaceTabs = data.workspaceTabs.map(t => ({
        id: String(t.id || `tab-${Math.random().toString(36).substr(2, 5)}`),
        ticker: String(t.ticker || "BTC").toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTC",
        exchange: String(t.exchange || "BINANCE").toUpperCase().replace(/[^A-Z0-9]/g, "") || "BINANCE",
        label: String(t.label || `${t.exchange || 'BINANCE'}: ${t.ticker || 'BTC'}`),
      }));
    }
    if (typeof data.activeTabId === "string" && workspaceTabs.some(t => t.id === data.activeTabId)) {
      activeTabId = data.activeTabId;
    } else if (workspaceTabs.length > 0) {
      activeTabId = workspaceTabs[0].id;
    }

    if (Array.isArray(data.watchlist) && data.watchlist.length > 0) {
      watchlist = data.watchlist.map(c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
    }
    if (Array.isArray(data.recentCoins)) {
      recentCoins = data.recentCoins.map(c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
    }

    const activeTab = workspaceTabs.find(t => t.id === activeTabId);
    if (activeTab) {
      currentTicker = activeTab.ticker;
      currentExchange = activeTab.exchange;
    }

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
          aiWidth,
          workspaceTabs,
          activeTabId,
          watchlist,
          recentCoins,
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

function tradingViewUrl(ticker, exchange, marketType = currentMarketType) {
  const t = String(ticker || "BTC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const ex = String(exchange || "BINANCE").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isPerpSupport = ["BINANCE", "BYBIT", "MEXC", "OKX", "BITGET", "KUCOIN"].includes(ex);
  const suffix = (marketType === "PERP" && isPerpSupport) ? ".P" : "";
  return `https://www.tradingview.com/chart/?symbol=${ex}:${t}USDT${suffix}`;
}

function coinGlassUrl(ticker, exchange) {
  const t = String(ticker || "BTC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  let ex = String(exchange || "BINANCE").toUpperCase().replace(/[^A-Z0-9]/g, "");
  
  // Coinglass Liquidation Heatmap supports specific exchanges. Fallback to BINANCE if unsupported.
  const supported = ["BINANCE", "BYBIT", "OKX", "BITGET", "HUOBI"];
  if (!supported.includes(ex)) ex = "BINANCE";

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
  MATIC: "polygon-ecosystem-token",
  POL: "polygon-ecosystem-token",
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
  ZEC: "zcash",
  XMR: "monero",
  VVV: "virtual-protocol",
  KAS: "kaspa",
  TAO: "bittensor",
  RENDER: "render",
  RNDR: "render",
  GALA: "gala",
  FLOKI: "floki",
  AR: "arweave",
  FET: "artificial-superintelligence-alliance",
  GRASS: "grass",
  RAY: "raydium",
  ONDO: "ondo",
  JASMY: "jasmy",
  BRETT: "brett",
  POPCAT: "popcat",
  MEW: "cat-in-a-dogs-world",
  NEIRO: "first-neiro-on-ethereum",
  GOAT: "goatseus-maximus",
  PNUT: "peanut-the-squirrel",
  ACT: "act-i-the-ai-prophecy",
  CHILLGUY: "just-a-chill-guy",
  FARTCOIN: "fartcoin",
  AI16Z: "ai16z",
  ZEREBRO: "zerebro",
  GRIFFAIN: "griffain",
  VIRTUAL: "virtual-protocol",
  SPX: "spx-6900",
  TURBO: "turbo",
  MEME: "memecoin",
  MOG: "mog-coin",
  BOME: "book-of-meme",
  MYRO: "myro",
  SLERF: "slerf",
  PONKE: "ponke",
  MOTHER: "mother-iggy",
  DADDY: "daddy-tate",
  GIGA: "gigachad",
  MICHI: "michi",
  SUNDOG: "sundog",
  MOODENG: "moo-deng",
  HIPPO: "sudeng",
  LUCE: "luce",
  PENGU: "pudgy-penguins",
  ZETA: "zetachain",
  STRK: "starknet",
  ZK: "zksync",
  BLAST: "blast",
  ENA: "ethena",
  SAGA: "saga",
  TNSR: "tensor",
  DRIFT: "drift-protocol",
  IO: "io-net",
  ZRO: "layerzero",
  LISTA: "lista-dao",
  REZ: "renzo",
  SAFE: "safe",
  BANANA: "banana-gun",
  DOGS: "dogs",
  NOT: "notcoin",
  HMSTR: "hamster-kombat",
  CATI: "catizen",
  MAJOR: "major",
  XEN: "xen-crypto",
  ORDI: "ordi",
  SATS: "sats-ordinals",
  RATS: "rats-ordinals",
  STX: "stacks",
  TIA: "celestia",
  DYM: "dymension",
  ALT: "altlayer",
  MANTA: "manta-network",
  PIXEL: "pixels",
  PORTAL: "portal",
  MAV: "maverick-protocol",
  PENDLE: "pendle",
  BLUR: "blur",
  GMX: "gmx",
  DYDX: "dydx",
  ENS: "ethereum-name-service",
  LDO: "lido-dao",
  RPL: "rocket-pool",
  FXS: "frax-share",
  CHZ: "chiliz",
  SAND: "the-sandbox",
  MANA: "decentraland",
  AXS: "axie-infinity",
  ILV: "illuvium",
  SUPER: "superverse",
  ALICE: "my-neighbor-alice",
  YGG: "yield-guild-games",
  CFX: "conflux-network",
  KLAY: "klaytn",
  THETA: "theta-network",
  EGLD: "multiversx",
  FLOW: "flow",
  MINA: "mina",
  KAVA: "kava",
  XLM: "stellar",
  ALGO: "algorand",
  EOS: "eos",
  XTZ: "tezos",
  NEO: "neo",
  IOTA: "iota",
  DASH: "dash",
  ZIL: "zilliqa",
  BAT: "basic-attention-token",
  ZRX: "0x",
  COMP: "compound",
  KSM: "kusama",
  WAVES: "waves",
  QTUM: "qtum",
  ONT: "ontology",
  ENJ: "enjin-coin",
  HOT: "holo",
  RVN: "ravencoin",
  SC: "siacoin",
  CELO: "celo",
  SCRT: "secret",
  ONE: "harmony",
  ROSE: "oasis-network",
  SKL: "skale-network",
  AUDIO: "audius",
  MASK: "mask-network",
  LPT: "livepeer",
  BAND: "band-protocol",
  RLC: "iexec-rlc",
  COTI: "coti",
  STORJ: "storj",
  ANKR: "ankr",
  GTC: "gitcoin",
  PEOPLE: "constitutiondao",
  SPELL: "spell-token",
  ACH: "alchemy-pay",
  TRB: "tellor",
  UMA: "uma",
  NMR: "numeraire",
  OCEAN: "ocean-protocol",
  AGIX: "singularitynet",
  SSV: "ssv-network",
  LRC: "loopring",
  "1INCH": "1inch",
  BAL: "balancer",
  SUSHI: "sushiswap",
  KNC: "kyber-network-crystal-v2",
  // Top Layer 1s, Layer 2s & Ecosystem Infrastructure
  OMNI: "omni-network",
  W: "wormhole",
  ATH: "aethir",
  AIOZ: "aioz-network",
  AKT: "akash-network",
  GLM: "golem-network-tokens",
  POKT: "pocket-network",
  CUDOS: "cudos",
  ALPH: "alephium",
  CLORE: "clore-ai",
  DIMO: "dimo",
  HONEY: "hivemapper",
  MOBILE: "helium-mobile",
  IOTX: "iotex",
  DATA: "streamr",
  RSS3: "rss3",
  NKN: "nkn",
  SIA: "siacoin",
  BTT: "bittorrent-new",
  SHDW: "shadow-token",
  BLZ: "bluzelle",
  PHB: "phoenix-global",
  MDT: "measurable-data-token",
  ALI: "artificial-liquid-intelligence",
  PAAL: "paal-ai",
  CGPT: "chaingpt",
  OLAS: "autonolas",
  SPEC: "spectral",
  ARKM: "arkham",
  RON: "ronin",
  RONIN: "ronin",
  BEAM: "beam",
  XAI: "xai-blockchain",
  MAVIA: "heroes-of-mavia",
  SHRAP: "shrapnel",
  NAKA: "nakamoto-games",
  PYR: "vulcan-forged",
  GODS: "gods-unchained",
  WILD: "wilder-world",
  POLIS: "star-atlas-polis",
  ATLAS: "star-atlas",
  ALIEN: "alien-worlds",
  DAR: "mines-of-dalarnia",
  VOXEL: "voxies",
  HIGH: "highstreet",
  MAGIC: "magic",
  GF: "guild-fi",
  LOKA: "league-of-kingdoms-arena",
  DERC: "derace",
  MC: "merit-circle",
  MERIT: "merit-circle",
  CROWN: "photo-finish-live",
  CARV: "carv",
  KARRAT: "karrat",
  RACA: "radio-caca",
  HERO: "metahero",
  DFL: "defi-land",
  UFO: "ufo-gaming",
  SFUND: "seedify-fund",
  BLOK: "bloktopia",
  VRA: "verasity",
  CGG: "chain-guardians",
  SIDUS: "sidus",
  FARA: "faraland",
  REVO: "revomon",
  // Meme & Community Trending
  WEN: "wen-sol",
  COQ: "coq-inu",
  TOSHI: "toshi",
  DEGEN: "degen-base",
  HIGHER: "higher",
  KEYCAT: "keyboard-cat",
  PURPE: "purpe",
  BENJI: "basenji",
  MANEKI: "maneki",
  WOLF: "landwolf",
  TRUMP: "official-trump",
  MAGA: "maga",
  TREMP: "doland-tremp",
  BODEN: "jeo-boden",
  PAC: "pac-man",
  NICK: "nick",
  MIGO: "migo",
  FOXY: "foxy",
  SMOG: "smog",
  DOG: "dog-go-to-the-moon",
  BABYDOGE: "baby-doge-coin",
  CORGI: "corgiai",
  CHEEMS: "cheems",
  SAMO: "samoyedcoin",
  ELON: "dogelon-mars",
  KISHU: "kishu-inu",
  AKITA: "akita-inu",
  PIT: "pitbull",
  TSUKA: "dejitaru-tsuka",
  PAW: "pawswap",
  AIDOGE: "arbinu",
  WOJAK: "wojak",
  LADYS: "milady-meme-coin",
  BOB: "bob-token",
  MONA: "monacoin",
  TURBOS: "turbos-finance",
  ANDY: "andy-eth",
  LANDWOLF: "landwolf-eth",
  BOBO: "bobo",
  RETARDIO: "retardio",
  HARAMBE: "harambe-on-solana",
  MINIDOGE: "minidoge",
  POOH: "pooh",
  REKT: "rekt",
  WHY: "why",
  MURAL: "mural",
  BILLY: "billy",
  LOCKIN: "lock-in",
  BERT: "bert",
  PUPS: "pups-ordinals",
  RSIC: "rsic-genesis-meta-protocol",
  GZIL: "governance-zil",
  // DeFi, Liquid Staking & Yield
  USDE: "ethena-usde",
  ETHFI: "ether-fi",
  BVM: "bvm",
  EIGEN: "eigenlayer",
  PUFFER: "puffer",
  SWELL: "swell-network",
  PRIME: "echelon-prime",
  ORCA: "orca",
  COW: "cow-protocol",
  GNS: "gains-network",
  PERP: "perpetual-protocol",
  GAINS: "gains-network",
  CYBER: "cyberconnect",
  HOOK: "hooked-protocol",
  EDU: "open-campus",
  COMBO: "combo",
  ID: "space-id",
  SPACE: "space-id",
  MOCA: "mocaverse",
  AERO: "aerodrome-finance",
  VELO: "velodrome-finance",
  JOE: "joe",
  QUICK: "quickswap",
  TRADER: "joe",
  EQU: "equalizer-dex",
  RADAR: "dappradar",
  SPECTRA: "spectra",
  MORPHO: "morpho",
  ZIRCUIT: "zircuit",
  // Exchange Tokens & Privacy/Classic
  ZEN: "horizen",
  ARRR: "pirate-chain",
  NYM: "nym",
  DERO: "dero",
  BEAMX: "beam",
  FIRO: "firo",
  XVG: "verge",
  KMD: "komodo",
  NAV: "nav-coin",
  PIVX: "pivx",
  OXEN: "oxen",
  MONERO: "monero",
  ZCASH: "zcash",
  NEXA: "nexa",
  DNX: "dynex",
  RXD: "radiant",
  SYS: "syscoin",
  ERG: "ergo",
  KCS: "kucoin-token",
  OKB: "okb",
  BGB: "bitget-token",
  GT: "gatetoken",
  HTX: "htx-token",
  WOO: "network-woo",
  LEO: "unus-sed-leo",
  CRO: "cronos",
  FTT: "ftx-token",
  MX: "mx-token",
  TEL: "telcoin",
  DGB: "digibyte",
  XEC: "ecash",
  NFT: "apenft",
  WIN: "winklink",
  VTHO: "vechain-thor-energy",
  GAS: "gas",
  ONG: "ontology-gas",
  NEBL: "neblio",
  STRAX: "stratis",
  XPR: "xpr-network",
  XCH: "chia-network",
  WAN: "wanchain",
  REEF: "reef",
  POA: "poa-network",
  GO: "gochain",
  ELA: "elastos",
  BTS: "bitshares",
  STEEM: "steem",
  HIVE: "hive-blockchain",
  SBD: "steem-dollars",
  LBC: "library-credit",
  ETN: "electroneum",
  "0G": "0g",
  "0X": "0x",
  "404": "erc404"
};

function cmcSlug(ticker) {
  const t = String(ticker || "BTC").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CMC_SLUGS[t] || null;
}

function cmcChartsUrl() {
  return "https://coinmarketcap.com/charts/";
}

function cmcCoinUrl(ticker) {
  const t = String(ticker || "BTC").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (CMC_SLUGS[t]) {
    return `https://coinmarketcap.com/currencies/${CMC_SLUGS[t]}/`;
  }
  return `https://coinmarketcap.com/search/?query=${encodeURIComponent(t)}`;
}

function createPaneView() {
  const view = new WebContentsView({
    webPreferences: {
      partition: "persist:crypto-hub",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  view.setBackgroundColor('#131722');
  view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      console.error(`Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    }
  });
  return view;
}

function buildTabPanes(tabId, ticker, exchange, marketType = currentMarketType) {
  const chartView = createPaneView();
  const heatmapView = createPaneView();
  const cmcView = createPaneView();

  for (const view of [chartView, heatmapView, cmcView]) {
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
    view.webContents.on('will-prevent-unload', (event) => {
      event.preventDefault();
    });
  }

  chartView.webContents.loadURL(tradingViewUrl(ticker, exchange, marketType));
  heatmapView.webContents.loadURL(coinGlassUrl(ticker, exchange));
  cmcView.webContents.loadURL(cmcChartsUrl());

  const panes = { chartView, heatmapView, cmcView };
  tabPanes.set(tabId, panes);
  return panes;
}

function attachTabPanes(tabId) {
  try {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.contentView) return;
    const panes = tabPanes.get(tabId);
    if (!panes) return;

    try { if (!panes.chartView.webContents.isDestroyed()) mainWindow.contentView.addChildView(panes.chartView); } catch (e) {}
    try { if (!panes.heatmapView.webContents.isDestroyed()) mainWindow.contentView.addChildView(panes.heatmapView); } catch (e) {}
    try { if (!panes.cmcView.webContents.isDestroyed()) mainWindow.contentView.addChildView(panes.cmcView); } catch (e) {}

    // Ensure splitters and top overlays stay on top of the newly added panes!
    if (aiView && !aiView.webContents.isDestroyed()) {
      try { mainWindow.contentView.removeChildView(aiView); } catch (e) {}
      try { mainWindow.contentView.addChildView(aiView); } catch (e) {}
    }
    if (leftSplit && !leftSplit.webContents.isDestroyed()) {
      try { mainWindow.contentView.removeChildView(leftSplit); } catch (e) {}
      try { mainWindow.contentView.addChildView(leftSplit); } catch (e) {}
    }
    if (rightSplit && !rightSplit.webContents.isDestroyed()) {
      try { mainWindow.contentView.removeChildView(rightSplit); } catch (e) {}
      try { mainWindow.contentView.addChildView(rightSplit); } catch (e) {}
    }
    if (cmcSplit && !cmcSplit.webContents.isDestroyed()) {
      try { mainWindow.contentView.removeChildView(cmcSplit); } catch (e) {}
      try { mainWindow.contentView.addChildView(cmcSplit); } catch (e) {}
    }
    if (controlView && !controlView.webContents.isDestroyed()) {
      try { mainWindow.contentView.removeChildView(controlView); } catch (e) {}
      try { mainWindow.contentView.addChildView(controlView); } catch (e) {}
    }
  } catch (e) {}
}

function detachTabPanes(tabId) {
  try {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.contentView) return;
    const panes = tabPanes.get(tabId);
    if (!panes) return;
    try { if (!panes.chartView.webContents.isDestroyed()) mainWindow.contentView.removeChildView(panes.chartView); } catch (e) {}
    try { if (!panes.heatmapView.webContents.isDestroyed()) mainWindow.contentView.removeChildView(panes.heatmapView); } catch (e) {}
    try { if (!panes.cmcView.webContents.isDestroyed()) mainWindow.contentView.removeChildView(panes.cmcView); } catch (e) {}
  } catch (e) {}
}

function destroyTabPanes(tabId) {
  try {
    detachTabPanes(tabId);
  } catch (e) {}
  const panes = tabPanes.get(tabId);
  if (!panes) return;
  try { if (!panes.chartView.webContents.isDestroyed()) panes.chartView.webContents.close(); } catch (e) {}
  try { if (!panes.heatmapView.webContents.isDestroyed()) panes.heatmapView.webContents.close(); } catch (e) {}
  try { if (!panes.cmcView.webContents.isDestroyed()) panes.cmcView.webContents.close(); } catch (e) {}
  tabPanes.delete(tabId);
}

function destroyAllTabPanes() {
  for (const tabId of Array.from(tabPanes.keys())) {
    try {
      destroyTabPanes(tabId);
    } catch (e) {}
  }
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
  view.setBackgroundColor('#131722');
  view.webContents.loadFile(path.join(__dirname, "splitter.html"), {
    query: { side },
  });
  return view;
}

function layout() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { width, height } = mainWindow.getContentBounds();
    const activePanes = getActiveTabPanes();
    const chartView = activePanes ? activePanes.chartView : null;
    const heatmapView = activePanes ? activePanes.heatmapView : null;
    const cmcView = activePanes ? activePanes.cmcView : null;


  // Reserve bottom space for CMC panel when open
  const panelH = cmcPanelOpen ? cmcHeight : 0;
  const splitH = cmcPanelOpen ? SPLIT_W : 0;
  const bodyH = Math.max(0, height - TOP_H - panelH - splitH);

  if (controlView) {
    const ctrlH = watchlistDrawerOpen ? Math.min(height, TOP_H + 420) : TOP_H;
    controlView.setBounds({ x: 0, y: 0, width, height: ctrlH });
    if (watchlistDrawerOpen && !controlView.webContents.isDestroyed() && mainWindow && !mainWindow.isDestroyed() && mainWindow.contentView) {
      try {
        mainWindow.contentView.removeChildView(controlView);
        mainWindow.contentView.addChildView(controlView);
      } catch (e) {}
    }
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

  const aiW = aiPanelOpen ? aiWidth : 0;
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
  } catch (e) {}
}

function statePayload() {
  return {
    ticker: currentTicker,
    exchange: currentExchange,
    marketType: currentMarketType,
    leftCollapsed,
    rightCollapsed,
    cmcPanelOpen,
    aiPanelOpen,
    cmcActiveTab,
    leftPct,
    rightPct,
    cmcHeight,
    aiWidth,
    workspaceTabs,
    activeTabId,
    watchlist,
    recentCoins,
    quick: watchlist,
  };
}

function broadcastState() {
  if (controlView) {
    controlView.webContents.send("symbol-changed", statePayload());
  }
}

function setSymbol(payload, { reload = true } = {}) {
  let ticker, exchange, marketType;
  if (typeof payload === "object" && payload !== null) {
    ticker = payload.ticker;
    exchange = payload.exchange;
    marketType = payload.marketType;
  } else {
    ticker = payload;
    exchange = currentExchange;
    marketType = currentMarketType;
  }

  const t = String(ticker || "BTC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "") || "BTC";
  const ex = String(exchange || "BINANCE")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "") || "BINANCE";
  const mt = (marketType === "SPOT" || marketType === "PERP") ? marketType : currentMarketType;

  currentTicker = t;
  currentExchange = ex;
  currentMarketType = mt;

  if (!watchlist.includes(t)) {
    recentCoins = [t, ...recentCoins.filter(c => c !== t)].slice(0, 8);
  }

  // Keep active tab updated
  const currTab = workspaceTabs.find(tab => tab.id === activeTabId);
  if (currTab) {
    const isCustomLabel = currTab.label && !currTab.label.includes(":");
    currTab.ticker = t;
    currTab.exchange = ex;
    currTab.marketType = mt;
    if (!isCustomLabel) {
      currTab.label = `${ex}: ${t}`;
    }
  }

  if (reload) {
    const activePanes = getActiveTabPanes();
    const chartView = activePanes ? activePanes.chartView : null;
    const heatmapView = activePanes ? activePanes.heatmapView : null;
    const cmcView = activePanes ? activePanes.cmcView : null;

    const targetTvUrl = tradingViewUrl(t, ex, mt);
    if (chartView && chartView.webContents.getURL() !== targetTvUrl) {
      chartView.webContents.loadURL(targetTvUrl);
    }

    const targetCgUrl = coinGlassUrl(t, ex);
    if (heatmapView && heatmapView.webContents.getURL() !== targetCgUrl) {
      heatmapView.webContents.loadURL(targetCgUrl);
    }

    // Always prime CMC when symbol changes so switching to Coin tab never hits a 404
    if (cmcView) {
      const keys = loadKeys();
      const cmcKey = keys["cmc"] ? safeStorage.decryptString(Buffer.from(keys["cmc"].key, "base64")) : null;
      marketIntel.fetchCMCCoin(t, cmcKey).then(data => {
        const resolvedSlug = data && data.slug ? data.slug : cmcSlug(t);
        const targetCmcUrl = resolvedSlug 
          ? `https://coinmarketcap.com/currencies/${resolvedSlug}/`
          : cmcCoinUrl(t);
        if (cmcActiveTab === "coin" && cmcView.webContents.getURL() !== targetCmcUrl) {
          cmcView.webContents.loadURL(targetCmcUrl);
        }
      }).catch(() => {
        const targetCmcUrl = cmcCoinUrl(t);
        if (cmcActiveTab === "coin" && cmcView.webContents.getURL() !== targetCmcUrl) {
          cmcView.webContents.loadURL(targetCmcUrl);
        }
      });
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
  controlView.setBackgroundColor("#00000000");
  controlView.webContents.loadFile(path.join(__dirname, "control.html"));

  bubblesView = createPaneView();
  
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

  for (const view of [bubblesView]) {
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

    view.webContents.on('will-prevent-unload', (event) => {
      event.preventDefault();
    });
  }

  mainWindow.contentView.addChildView(controlView);
  mainWindow.contentView.addChildView(bubblesView);
  mainWindow.contentView.addChildView(aiView);
  mainWindow.contentView.addChildView(leftSplit);
  mainWindow.contentView.addChildView(rightSplit);
  mainWindow.contentView.addChildView(cmcSplit);

  const activeTab = workspaceTabs.find(t => t.id === activeTabId) || workspaceTabs[0] || { id: "tab-1", ticker: currentTicker, exchange: currentExchange };
  if (!tabPanes.has(activeTab.id)) {
    buildTabPanes(activeTab.id, activeTab.ticker, activeTab.exchange);
  }
  attachTabPanes(activeTab.id);

  bubblesView.webContents.loadURL(bubblesUrl());

  layout();
  mainWindow.on("resize", layout);

  controlView.webContents.on("did-finish-load", () => {
    broadcastState();
  });

  mainWindow.on("closed", () => {
    saveSettings();
    destroyAllTabPanes();
    mainWindow = null;
    controlView = null;
    bubblesView = null;
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

app.whenReady().then(async () => {
  createWindow();
  startFundingAlertWatcher();
  // Init P&L SQLite database
  try {
    await portfolioService.initDB(app.getPath("userData"));
    console.log("[main] Portfolio DB ready.");
  } catch (e) {
    console.error("[main] Portfolio DB init failed:", e.message);
  }
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

ipcMain.on("add-watchlist", (_e, coin) => {
  const c = String(coin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c && !watchlist.includes(c)) {
    watchlist.push(c);
    recentCoins = recentCoins.filter(x => x !== c);
    saveSettings();
    broadcastState();
  }
});

ipcMain.on("remove-watchlist", (_e, coin) => {
  const c = String(coin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c) {
    watchlist = watchlist.filter(x => x !== c);
    saveSettings();
    broadcastState();
  }
});

ipcMain.on("pin-recent", (_e, coin) => {
  const c = String(coin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c && !watchlist.includes(c)) {
    watchlist.push(c);
    recentCoins = recentCoins.filter(x => x !== c);
    saveSettings();
    broadcastState();
  }
});

ipcMain.on("set-watchlist-drawer-open", (_e, isOpen) => {
  watchlistDrawerOpen = !!isOpen;
  if (controlView && !controlView.webContents.isDestroyed() && mainWindow && !mainWindow.isDestroyed() && mainWindow.contentView) {
    try {
      mainWindow.contentView.removeChildView(controlView);
      mainWindow.contentView.addChildView(controlView);
    } catch (e) {}
  }
  layout();
});

ipcMain.on("create-tab", (_e, payload) => {
  if (workspaceTabs.length >= 10) {
    if (controlView) {
      controlView.webContents.send("tab-limit-reached", { max: 10 });
    }
    return;
  }
  const newId = `tab-${Date.now()}`;
  const t = (payload && payload.ticker) ? String(payload.ticker).toUpperCase().replace(/[^A-Z0-9]/g, "") : currentTicker;
  const ex = (payload && payload.exchange) ? String(payload.exchange).toUpperCase().replace(/[^A-Z0-9]/g, "") : currentExchange;
  const mt = (payload && payload.marketType) ? payload.marketType : currentMarketType;
  const newTab = {
    id: newId,
    ticker: t,
    exchange: ex,
    marketType: mt,
    label: `${ex}: ${t}`
  };
  
  detachTabPanes(activeTabId);
  workspaceTabs.push(newTab);
  activeTabId = newId;
  setSymbol({ ticker: t, exchange: ex, marketType: mt }, { reload: false });

  buildTabPanes(newId, t, ex, mt);
  attachTabPanes(newId);
  layout();
  saveSettings();
  broadcastState();
});

ipcMain.on("switch-tab", (_e, tabId) => {
  if (activeTabId === tabId) return;
  const target = workspaceTabs.find(t => t.id === tabId);
  if (!target) return;

  detachTabPanes(activeTabId);
  activeTabId = tabId;
  setSymbol({ ticker: target.ticker, exchange: target.exchange, marketType: target.marketType || "PERP" }, { reload: false });

  if (!tabPanes.has(tabId)) {
    buildTabPanes(tabId, target.ticker, target.exchange, target.marketType || "PERP");
  }
  attachTabPanes(tabId);
  layout();
  saveSettings();
  broadcastState();
});

ipcMain.on("close-tab", (_e, tabId) => {
  if (workspaceTabs.length <= 1) return; // Keep at least 1 tab open
  const idx = workspaceTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  const wasActive = (activeTabId === tabId);
  workspaceTabs.splice(idx, 1);

  if (wasActive) {
    detachTabPanes(tabId);
    const nextTab = workspaceTabs[Math.max(0, idx - 1)];
    activeTabId = nextTab.id;
    setSymbol({ ticker: nextTab.ticker, exchange: nextTab.exchange, marketType: nextTab.marketType || "PERP" }, { reload: false });

    if (!tabPanes.has(activeTabId)) {
      buildTabPanes(activeTabId, nextTab.ticker, nextTab.exchange, nextTab.marketType || "PERP");
    }
    attachTabPanes(activeTabId);
    layout();
  }

  destroyTabPanes(tabId);
  saveSettings();
  broadcastState();
});


ipcMain.on("rename-tab", (_e, payload) => {
  if (!payload || !payload.id || !payload.label) return;
  const target = workspaceTabs.find(t => t.id === payload.id);
  if (target) {
    target.label = String(payload.label).trim().slice(0, 20) || `${target.exchange}: ${target.ticker}`;
    saveSettings();
    broadcastState();
  }
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
    startAiWidth: aiWidth,
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

  if (drag.side === "ai-left") {
    const dx = drag.startX - screenX;
    let newW = drag.startAiWidth + dx;
    newW = clamp(newW, 260, 800);
    aiWidth = newW;
    layout();
    broadcastState();
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
  const activePanes = getActiveTabPanes();
  if (!activePanes) return;
  if (pane === "chart" && activePanes.chartView) activePanes.chartView.webContents.reload();
  if (pane === "heatmap" && activePanes.heatmapView) activePanes.heatmapView.webContents.reload();
  if (pane === "cmc" && activePanes.cmcView) activePanes.cmcView.webContents.reload();
});

ipcMain.on("navigate-pane", (_e, pane) => {
  if (pane === "bubbles" && bubblesView) {
    bubblesView.webContents.loadURL(bubblesUrl());
  }
  const activePanes = getActiveTabPanes();
  if (!activePanes) return;
  if (pane === "chart" && activePanes.chartView) {
    activePanes.chartView.webContents.loadURL(tradingViewUrl(currentTicker, currentExchange, currentMarketType));
  }
  if (pane === "heatmap" && activePanes.heatmapView) {
    activePanes.heatmapView.webContents.loadURL(coinGlassUrl(currentTicker, currentExchange));
  }
});

// --- CMC Panel IPC ---

ipcMain.on("cmc-toggle", () => {
  cmcPanelOpen = !cmcPanelOpen;
  layout();
  broadcastState();
});

ipcMain.on("cmc-tab", (_e, tab) => {
  const activePanes = getActiveTabPanes();
  if (!activePanes || !activePanes.cmcView) return;
  const cmcView = activePanes.cmcView;
  cmcActiveTab = tab;
  
  if (tab === "market") {
    cmcView.webContents.loadURL(cmcChartsUrl());
  } else if (tab === "coin") {
    const keys = loadKeys();
    const cmcKey = keys["cmc"] ? safeStorage.decryptString(Buffer.from(keys["cmc"].key, "base64")) : null;
    marketIntel.fetchCMCCoin(currentTicker, cmcKey).then(data => {
      const resolvedSlug = data && data.slug ? data.slug : cmcSlug(currentTicker);
      if (resolvedSlug) {
        cmcView.webContents.loadURL(`https://coinmarketcap.com/currencies/${resolvedSlug}/`);
      } else {
        cmcView.webContents.loadURL(cmcCoinUrl(currentTicker));
      }
    }).catch(() => {
      cmcView.webContents.loadURL(cmcCoinUrl(currentTicker));
    });
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

ipcMain.on("open-market-intel", () => {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    title: "Market Intelligence Dashboard",
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile(path.join(__dirname, "market-intel-ui.html"));
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

ipcMain.handle("save-cryptocompare-key", (_e, apiKey) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { success: false, error: "OS Encryption not available" };
    const keys = loadKeys();
    keys["cryptocompare"] = { key: safeStorage.encryptString(apiKey).toString("base64") };
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

ipcMain.handle("get-coin-intelligence", async (_e, symbol, exchangeId = 'binance') => {
  try {
    const keys = loadKeys();
    const cmcKey = keys["cmc"] ? safeStorage.decryptString(Buffer.from(keys["cmc"].key, "base64")) : null;
    const lcKey = keys["lunarcrush"] ? safeStorage.decryptString(Buffer.from(keys["lunarcrush"].key, "base64")) : null;
    if (!cmcKey) return { success: false, error: "No CoinMarketCap API key found in Vault." };
    const [coinData, socialData, derivatives] = await Promise.all([
      marketIntel.fetchCMCCoin(symbol, cmcKey),
      marketIntel.fetchLunarCrushSocial(symbol, lcKey),
      marketIntel.getSpecificCoinDerivatives(symbol, exchangeId),
    ]);
    return { success: true, coin: coinData, social: socialData, derivatives: derivatives };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-market-extras", async () => {
  try {
    const keys = loadKeys();
    const ccKey = keys["cryptocompare"] ? safeStorage.decryptString(Buffer.from(keys["cryptocompare"].key, "base64")) : null;
    const extras = await marketIntel.getMarketExtras(ccKey);
    return { success: true, extras };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-funding-rates", async (_e, exchangeId) => {
  try {
    const rates = await marketIntel.getFundingRatesData(exchangeId);
    return { success: true, rates };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-open-interest", async (_e, exchangeId) => {
  try {
    const oiData = await marketIntel.getOpenInterestData(exchangeId);
    return { success: true, oiData };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-coin-news", async (_e, symbol) => {
  try {
    const keys = loadKeys();
    const ccKey = keys["cryptocompare"] ? safeStorage.decryptString(Buffer.from(keys["cryptocompare"].key, "base64")) : null;
    const news = await marketIntel.fetchCryptoNews(symbol, ccKey);
    return { success: true, news };
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

      // Dynamically fetch LunarCrush social data for currentTicker and any tickers mentioned in prompt
      const promptTickers = new Set([currentTicker]);
      const matches = prompt.match(/\b[A-Z]{2,6}\b/gi) || [];
      matches.forEach(m => promptTickers.add(m.toUpperCase()));

      for (const ticker of promptTickers) {
        try {
          const social = await marketIntel.fetchLunarCrushSocial(ticker);
          if (social) {
            marketContext += `\n\n=== LUNARCRUSH SOCIAL INTELLIGENCE FOR ${ticker} ===\n`;
            marketContext += `Galaxy Score (0-100): ${social.galaxyScore || 'N/A'}\n`;
            marketContext += `AltRank (vs BTC): ${social.altRank || 'N/A'}\n`;
            marketContext += `Social Volume 24h: ${social.socialVolume24h || 'N/A'}\n`;
            marketContext += `Bullish Sentiment (1-5): ${social.bullishSentiment || 'N/A'}\n`;
          }
        } catch (err) { /* ignore if not found */ }
      }
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

// --- Background Alert Watcher ---
let notifiedCoins = new Set();
function startFundingAlertWatcher() {
  // Check every 15 minutes (900,000 ms)
  setInterval(async () => {
    try {
      // Monitor Binance by default
      const rates = await marketIntel.getFundingRatesData('binance');
      if (!rates) return;

      rates.forEach(r => {
        // Threshold +/- 0.5%
        if (Math.abs(r.rate) >= 0.5) {
          const coinKey = `${r.symbol}_${r.rate}`; // simple deduplication
          if (!notifiedCoins.has(coinKey)) {
            notifiedCoins.add(coinKey);
            const isShortSqueeze = r.rate < 0;
            const title = isShortSqueeze ? `⚠️ Extreme Short-Squeeze Warning: ${r.symbol}` : `⚠️ Extreme Long-Squeeze Warning: ${r.symbol}`;
            const body = `Funding rate hit ${r.rate.toFixed(4)}% on Binance. High risk of a violent squeeze!`;
            
            if (Notification.isSupported()) {
              new Notification({ title, body, icon: path.join(__dirname, 'icon.png') }).show();
            }
          }
        }
      });
      
      // Cleanup old notifications from memory
      if (notifiedCoins.size > 100) {
        notifiedCoins.clear();
      }
    } catch (e) {
      console.error("Alert watcher error:", e);
    }
  }, 15 * 60 * 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: Auto-Refresh Timer
// ═══════════════════════════════════════════════════════════════════════════
let autoRefreshInterval = null;

ipcMain.handle("set-auto-refresh", (_e, seconds) => {
  // Clear any existing interval
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }

  if (!seconds || seconds <= 0) {
    return { success: true, active: false };
  }

  // Set the new polling interval
  autoRefreshInterval = setInterval(async () => {
    try {
      // Re-fire the market intel UI refresh by broadcasting to market intel windows
      const wins = BrowserWindow.getAllWindows();
      wins.forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send("auto-refresh-tick");
        }
      });
    } catch (e) {
      console.error("[AutoRefresh] Error:", e.message);
    }
  }, seconds * 1000);

  return { success: true, active: true, intervalSeconds: seconds };
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: Funding Rate History (Sparklines)
// ═══════════════════════════════════════════════════════════════════════════
ipcMain.handle("get-funding-rate-history", async (_e, symbol, exchangeId = "binance", limit = 8) => {
  try {
    const history = await marketIntel.fetchFundingRateHistory(symbol, exchangeId, limit);
    return { success: true, history };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: New Exchange Keys (Gate.io, KuCoin, Hyperliquid)
// ═══════════════════════════════════════════════════════════════════════════
const SUPPORTED_NEW_EXCHANGES = ["gate", "kucoin", "hyperliquid"];

// Reuse existing save-api-key IPC — it already supports any exchange name.
// These exchanges just need to appear in the portfolio.html UI.



// ═══════════════════════════════════════════════════════════════════════════
// PHASE 7: P&L Snapshot & History
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch current prices for all held assets using CoinGecko (free, no key).
 * Returns { BTC: 65000, ETH: 3500, ... }
 */
async function fetchPricesForAssets(symbols) {
  try {
    if (!symbols || symbols.length === 0) return {};
    // Map common tickers to CoinGecko IDs
    const geckoIds = {
      BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
      XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", MATIC: "matic-network",
      DOT: "polkadot", AVAX: "avalanche-2", LINK: "chainlink", UNI: "uniswap",
      ATOM: "cosmos", LTC: "litecoin", BCH: "bitcoin-cash", SUI: "sui",
      PEPE: "pepe", SHIB: "shiba-inu", TRX: "tron", NEAR: "near",
    };

    const ids = [...new Set(symbols.map(s => geckoIds[s.toUpperCase()]).filter(Boolean))];
    if (ids.length === 0) return {};

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;
    const { net } = require("electron");
    return new Promise((resolve) => {
      const req = net.request({ url, method: "GET" });
      let body = "";
      req.on("response", (res) => {
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            const prices = {};
            for (const [sym, id] of Object.entries(geckoIds)) {
              if (json[id]?.usd) prices[sym] = json[id].usd;
            }
            resolve(prices);
          } catch { resolve({}); }
        });
      });
      req.on("error", () => resolve({}));
      req.end();
    });
  } catch { return {}; }
}

ipcMain.handle("take-pnl-snapshot", async () => {
  try {
    const keys = loadKeys();
    const exchangeIds = Object.keys(keys).filter(
      k => !["gemini", "cmc", "lunarcrush", "cryptocompare"].includes(k)
    );

    if (exchangeIds.length === 0) {
      return { success: false, error: "No exchange keys connected." };
    }

    const ccxt = require("ccxt");
    const allSymbols = new Set(["USDT", "BUSD", "USDC"]);
    const balancesMap = {};

    for (const exId of exchangeIds) {
      if (!ccxt[exId] || !keys[exId]?.key) continue;
      try {
        const k = safeStorage.decryptString(Buffer.from(keys[exId].key, "base64"));
        const s = safeStorage.decryptString(Buffer.from(keys[exId].secret, "base64"));
        const exchange = new ccxt[exId]({ apiKey: k, secret: s, enableRateLimit: true });

        let merged = {};
        try {
          const spot = await exchange.fetchBalance({ type: "spot" });
          for (const [coin, val] of Object.entries(spot.total || {})) {
            if (val > 0) { merged[coin] = (merged[coin] || 0) + val; allSymbols.add(coin); }
          }
        } catch { /* spot may not be available */ }
        try {
          const swap = await exchange.fetchBalance({ type: "swap" });
          for (const [coin, val] of Object.entries(swap.total || {})) {
            if (val > 0) { merged[coin] = (merged[coin] || 0) + val; allSymbols.add(coin); }
          }
        } catch { /* futures may not be available */ }

        if (Object.keys(merged).length > 0) balancesMap[exId] = merged;
      } catch (e) {
        console.warn(`[PnL Snapshot] Failed for ${exId}:`, e.message);
      }
    }

    if (Object.keys(balancesMap).length === 0) {
      return { success: false, error: "Could not fetch balances from any connected exchange." };
    }

    // Fetch current prices for all held assets
    const prices = await fetchPricesForAssets([...allSymbols]);
    const result = portfolioService.takeSnapshot(app.getPath("userData"), balancesMap, prices);

    return { success: true, snapshot: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-pnl-history", (_e, days = 30) => {
  try {
    const history = portfolioService.getHistory(days);
    return { success: true, history };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
