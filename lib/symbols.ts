export type CoinMeta = {
  ticker: string;
  name: string;
  tradingView: string;
  coinGlass: string;
};

/** Popular coins for quick picks and search autocomplete. */
export const TOP_COINS: CoinMeta[] = [
  { ticker: "BTC", name: "Bitcoin", tradingView: "BINANCE:BTCUSDT", coinGlass: "BTC" },
  { ticker: "ETH", name: "Ethereum", tradingView: "BINANCE:ETHUSDT", coinGlass: "ETH" },
  { ticker: "SOL", name: "Solana", tradingView: "BINANCE:SOLUSDT", coinGlass: "SOL" },
  { ticker: "XRP", name: "XRP", tradingView: "BINANCE:XRPUSDT", coinGlass: "XRP" },
  { ticker: "BNB", name: "BNB", tradingView: "BINANCE:BNBUSDT", coinGlass: "BNB" },
  { ticker: "DOGE", name: "Dogecoin", tradingView: "BINANCE:DOGEUSDT", coinGlass: "DOGE" },
  { ticker: "ADA", name: "Cardano", tradingView: "BINANCE:ADAUSDT", coinGlass: "ADA" },
  { ticker: "AVAX", name: "Avalanche", tradingView: "BINANCE:AVAXUSDT", coinGlass: "AVAX" },
  { ticker: "LINK", name: "Chainlink", tradingView: "BINANCE:LINKUSDT", coinGlass: "LINK" },
  { ticker: "DOT", name: "Polkadot", tradingView: "BINANCE:DOTUSDT", coinGlass: "DOT" },
  { ticker: "MATIC", name: "Polygon", tradingView: "BINANCE:MATICUSDT", coinGlass: "MATIC" },
  { ticker: "NEAR", name: "NEAR", tradingView: "BINANCE:NEARUSDT", coinGlass: "NEAR" },
  { ticker: "APT", name: "Aptos", tradingView: "BINANCE:APTUSDT", coinGlass: "APT" },
  { ticker: "ARB", name: "Arbitrum", tradingView: "BINANCE:ARBUSDT", coinGlass: "ARB" },
  { ticker: "OP", name: "Optimism", tradingView: "BINANCE:OPUSDT", coinGlass: "OP" },
  { ticker: "SUI", name: "Sui", tradingView: "BINANCE:SUIUSDT", coinGlass: "SUI" },
  { ticker: "PEPE", name: "Pepe", tradingView: "BINANCE:PEPEUSDT", coinGlass: "PEPE" },
  { ticker: "WIF", name: "dogwifhat", tradingView: "BINANCE:WIFUSDT", coinGlass: "WIF" },
  { ticker: "TON", name: "Toncoin", tradingView: "BINANCE:TONUSDT", coinGlass: "TON" },
  { ticker: "TRX", name: "TRON", tradingView: "BINANCE:TRXUSDT", coinGlass: "TRX" },
  { ticker: "LTC", name: "Litecoin", tradingView: "BINANCE:LTCUSDT", coinGlass: "LTC" },
  { ticker: "UNI", name: "Uniswap", tradingView: "BINANCE:UNIUSDT", coinGlass: "UNI" },
  { ticker: "ATOM", name: "Cosmos", tradingView: "BINANCE:ATOMUSDT", coinGlass: "ATOM" },
  { ticker: "FIL", name: "Filecoin", tradingView: "BINANCE:FILUSDT", coinGlass: "FIL" },
  { ticker: "AAVE", name: "Aave", tradingView: "BINANCE:AAVEUSDT", coinGlass: "AAVE" },
];

export const DEFAULT_TICKER = "BTC";

export function normalizeTicker(input: string): string {
  const raw = input.trim().toUpperCase();
  if (!raw) return DEFAULT_TICKER;

  // Already a TV-style pair: BINANCE:BTCUSDT or BTCUSDT
  if (raw.includes(":")) {
    const after = raw.split(":").pop() ?? raw;
    return stripQuote(after);
  }
  if (raw.endsWith("USDT") || raw.endsWith("USD") || raw.endsWith("PERP")) {
    return stripQuote(raw);
  }
  return raw.replace(/[^A-Z0-9]/g, "") || DEFAULT_TICKER;
}

function stripQuote(pair: string): string {
  return pair
    .replace(/USDT$/i, "")
    .replace(/USD$/i, "")
    .replace(/PERP$/i, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase() || DEFAULT_TICKER;
}

export const DEFAULT_EXCHANGE = "BINANCE";

export function resolveCoin(input: string, exchange: string = DEFAULT_EXCHANGE): CoinMeta {
  const ticker = normalizeTicker(input);
  const known = TOP_COINS.find((c) => c.ticker === ticker);
  if (known) {
    return {
      ...known,
      tradingView: `${exchange}:${ticker}USDT`
    };
  }

  return {
    ticker,
    name: ticker,
    tradingView: `${exchange}:${ticker}USDT`,
    coinGlass: ticker,
  };
}

export function searchCoins(query: string, limit = 8): CoinMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOP_COINS.slice(0, limit);

  return TOP_COINS.filter(
    (c) =>
      c.ticker.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q)
  ).slice(0, limit);
}

export function tradingViewChartUrl(tradingViewSymbol: string): string {
  // tradingViewSymbol is expected to be in format EXCHANGE:COIN
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol)}`;
}

export function coinGlassHeatmapUrl(coinGlassSymbol: string, exchange: string = DEFAULT_EXCHANGE): string {
  return `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=${encodeURIComponent(coinGlassSymbol)}&exchange=${encodeURIComponent(exchange)}`;
}

export const CRYPTO_BUBBLES_URL = "https://cryptobubbles.net/en";
