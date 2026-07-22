/**
 * market-intel.cjs
 * Fetches and caches live market intelligence for the AI Co-Pilot.
 *
 * Data Sources:
 *  - Fear & Greed Index: api.alternative.me (free, no key)
 *  - CoinMarketCap: pro-api.coinmarketcap.com (free tier, CMC key required)
 *  - LunarCrush: lunarcrush.com/api4/public (social metrics, free public endpoints)
 */

const { net } = require("electron");

// ─── Cache ──────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const cache = {
  pulse: null,        // { data, ts }
  topMovers: null,    // { data, ts }
  extras: null,       // { data, ts }
  coinCache: {},      // { [symbol]: { data, ts } }
  socialCache: {},    // { [symbol]: { data, ts } }
  newsCache: {},      // { [symbol]: { data, ts } }
};

function isFresh(entry) {
  return entry && Date.now() - entry.ts < CACHE_TTL_MS;
}

// ─── HTTP Helper ─────────────────────────────────────────────────────────────
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: "GET" });
    Object.entries(headers).forEach(([k, v]) => req.setHeader(k, v));
    let body = "";
    req.on("response", (res) => {
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error("JSON parse failed: " + body.slice(0, 200)));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ─── Fear & Greed Index ──────────────────────────────────────────────────────
async function fetchFearGreed() {
  try {
    const data = await httpGet("https://api.alternative.me/fng/?limit=2");
    const current = data.data?.[0];
    const yesterday = data.data?.[1];
    if (!current) return null;
    return {
      value: parseInt(current.value),
      label: current.value_classification,
      yesterdayValue: yesterday ? parseInt(yesterday.value) : null,
      yesterdayLabel: yesterday ? yesterday.value_classification : null,
      interpretation: getFGInterpretation(parseInt(current.value)),
    };
  } catch (e) {
    console.error("[MarketIntel] Fear & Greed fetch failed:", e.message);
    return null;
  }
}

function getFGInterpretation(value) {
  if (value <= 20) return "Extreme Fear — historically strong buy zone. Market is panic-selling.";
  if (value <= 40) return "Fear — cautious market. Smart money often accumulates here.";
  if (value <= 60) return "Neutral — market is balanced. Wait for confirmation before entering.";
  if (value <= 80) return "Greed — market is overheated. Risk of correction is elevated.";
  return "Extreme Greed — danger zone. Many tokens are overbought. Consider taking profits.";
}

// ─── CoinMarketCap Global Metrics ────────────────────────────────────────────
async function fetchCMCGlobal(cmcKey) {
  try {
    const data = await httpGet(
      "https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest",
      { "X-CMC_PRO_API_KEY": cmcKey, Accept: "application/json" }
    );
    if (data.status?.error_code !== 0) throw new Error(data.status?.error_message);
    const q = data.data?.quote?.USD;
    return {
      totalMarketCapUSD: q?.total_market_cap,
      totalVolumeUSD: q?.total_volume_24h,
      btcDominance: data.data?.btc_dominance,
      ethDominance: data.data?.eth_dominance,
      marketCapChange24h: q?.total_market_cap_yesterday_percentage_change,
      activeCryptocurrencies: data.data?.active_cryptocurrencies,
      activeMarketPairs: data.data?.active_market_pairs,
    };
  } catch (e) {
    console.error("[MarketIntel] CMC Global fetch failed:", e.message);
    return null;
  }
}

// ─── CMC Top Movers ───────────────────────────────────────────────────────────
async function fetchCMCTopMovers(cmcKey) {
  try {
    // Fetch top 100 by market cap, then sort client-side
    const data = await httpGet(
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=100&convert=USD&sort=market_cap",
      { "X-CMC_PRO_API_KEY": cmcKey, Accept: "application/json" }
    );
    if (data.status?.error_code !== 0) throw new Error(data.status?.error_message);

    const coins = (data.data || []).map((c) => ({
      rank: c.cmc_rank,
      name: c.name,
      symbol: c.symbol,
      price: c.quote?.USD?.price,
      marketCap: c.quote?.USD?.market_cap,
      volume24h: c.quote?.USD?.volume_24h,
      change1h: c.quote?.USD?.percent_change_1h,
      change24h: c.quote?.USD?.percent_change_24h,
      change7d: c.quote?.USD?.percent_change_7d,
      circulatingSupply: c.circulating_supply,
      maxSupply: c.max_supply,
      totalSupply: c.total_supply,
    }));

    const gainers = [...coins].sort((a, b) => b.change24h - a.change24h).slice(0, 10);
    const losers = [...coins].sort((a, b) => a.change24h - b.change24h).slice(0, 10);
    const byVolume = [...coins].sort((a, b) => b.volume24h - a.volume24h).slice(0, 10);

    return { coins, gainers, losers, byVolume };
  } catch (e) {
    console.error("[MarketIntel] CMC Top Movers fetch failed:", e.message);
    return null;
  }
}

// ─── CMC Specific Coin Quote ──────────────────────────────────────────────────
async function fetchCMCCoin(symbol, cmcKey) {
  if (isFresh(cache.coinCache[symbol])) return cache.coinCache[symbol].data;
  try {
    const data = await httpGet(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol.toUpperCase()}&convert=USD`,
      { "X-CMC_PRO_API_KEY": cmcKey, Accept: "application/json" }
    );
    if (data.status?.error_code !== 0) throw new Error(data.status?.error_message);
    const c = data.data?.[symbol.toUpperCase()];
    if (!c) throw new Error("Symbol not found: " + symbol);
    const result = {
      name: c.name,
      symbol: c.symbol,
      slug: c.slug,
      cmcRank: c.cmc_rank,
      price: c.quote?.USD?.price,
      marketCap: c.quote?.USD?.market_cap,
      fullyDilutedMarketCap: c.quote?.USD?.fully_diluted_market_cap,
      volume24h: c.quote?.USD?.volume_24h,
      volumeToMarketCap: c.quote?.USD?.volume_24h / c.quote?.USD?.market_cap,
      change1h: c.quote?.USD?.percent_change_1h,
      change24h: c.quote?.USD?.percent_change_24h,
      change7d: c.quote?.USD?.percent_change_7d,
      circulatingSupply: c.circulating_supply,
      totalSupply: c.total_supply,
      maxSupply: c.max_supply,
    };
    cache.coinCache[symbol] = { data: result, ts: Date.now() };
    return result;
  } catch (e) {
    console.error(`[MarketIntel] CMC Coin fetch failed for ${symbol}:`, e.message);
    return null;
  }
}

// ─── LunarCrush Social Metrics ────────────────────────────────────────────────
// Uses LunarCrush public v4 API — API key highly recommended to avoid 401/rate-limits
async function fetchLunarCrushSocial(symbol, apiKey = null) {
  if (isFresh(cache.socialCache[symbol])) return cache.socialCache[symbol].data;
  try {
    const headers = apiKey ? { "Authorization": `Bearer ${apiKey}` } : {};
    const data = await httpGet(
      `https://lunarcrush.com/api4/public/topic/${symbol.toLowerCase()}/v1`,
      headers
    );
    if (data.error) throw new Error(data.error);
    const c = data.topic ? data : data.data; // Handle both flat and wrapped responses
    if (!c) throw new Error("No LunarCrush data for " + symbol);
    const result = {
      galaxyScore: c.galaxy_score,          // 0-100 combined health score
      altRank: c.alt_rank,                   // Ranking vs BTC performance
      socialVolume24h: c.social_volume_24h,  // # social posts
      socialScore: c.social_score,           // engagement score
      socialDominance: c.social_dominance,   // % of total crypto social volume
      marketDominance: c.market_dominance,
      bullishSentiment: c.sentiment,         // 1-5 scale
      interactions24h: c.interactions_24h,
    };
    cache.socialCache[symbol] = { data: result, ts: Date.now() };
    return result;
  } catch (e) {
    // LunarCrush public API may rate-limit — fail silently
    console.warn(`[MarketIntel] LunarCrush fetch failed for ${symbol}:`, e.message);
    return null;
  }
}

// ─── Altcoin Season Index (calculated from CMC data) ─────────────────────────
function calculateAltcoinSeason(coins) {
  if (!coins || coins.length < 10) return null;
  // Standard definition: how many of top 50 (excl BTC) outperformed BTC over 90d
  // We use 7d change as a proxy since we don't have 90d from listings
  const btc = coins.find((c) => c.symbol === "BTC");
  if (!btc) return null;
  const btcChange = btc.change7d || 0;
  const top50 = coins.filter((c) => c.symbol !== "BTC").slice(0, 49);
  const outperformed = top50.filter((c) => (c.change7d || 0) > btcChange).length;
  const score = Math.round((outperformed / 49) * 100);
  let label, interpretation;
  if (score >= 75) {
    label = "Altcoin Season";
    interpretation = "Altcoins are massively outperforming Bitcoin. High-risk, high-reward environment.";
  } else if (score >= 55) {
    label = "Leaning Altcoin";
    interpretation = "Altcoins gaining ground on Bitcoin. Selective altcoin trades may outperform.";
  } else if (score >= 45) {
    label = "Neutral";
    interpretation = "Mixed market. Both BTC and altcoins are viable. Follow volume and momentum.";
  } else if (score >= 25) {
    label = "Leaning Bitcoin Season";
    interpretation = "Bitcoin is outperforming most altcoins. BTC-heavy portfolio is safer right now.";
  } else {
    label = "Bitcoin Season";
    interpretation = "Bitcoin dominates. Altcoins are bleeding against BTC. Stick to BTC or stables.";
  }
  return { score, label, interpretation, btcChange7d: btcChange, altsOutperforming: outperformed };
}

// ─── Crypto News (CryptoCompare) ──────────────────────────────────────────────
async function fetchCryptoNews(symbol = null, ccKey = null) {
  if (!ccKey) {
    console.error("[MarketIntel] CryptoCompare API key missing.");
    return [];
  }
  const cacheKey = symbol ? symbol.toUpperCase() : "GLOBAL";
  if (isFresh(cache.newsCache[cacheKey])) return cache.newsCache[cacheKey].data;
  try {
    const categories = symbol ? `&categories=${symbol.toUpperCase()}` : "";
    const data = await httpGet(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN${categories}`, {
      authorization: `Apikey ${ccKey}`
    });
    if (data.Type < 100) throw new Error(data.Message || "Failed to fetch news");
    const articles = data.Data || [];
    const result = articles.slice(0, 10).map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body.slice(0, 150) + "...",
      url: a.url,
      source: a.source_info?.name,
      image: a.imageurl,
      published_on: a.published_on
    }));
    cache.newsCache[cacheKey] = { data: result, ts: Date.now() };
    return result;
  } catch (e) {
    console.error("[MarketIntel] Crypto News fetch failed:", e.message);
    return [];
  }
}

// ─── CCXT Funding Rates ───────────────────────────────────────────────────────
const ccxt = require("ccxt");
const exchangeInstances = {
  binance: new ccxt.binance({ options: { defaultType: "future" } }),
  bybit: new ccxt.bybit({ options: { defaultType: "swap" } }),
  mexc: new ccxt.mexc({ options: { defaultType: "swap" } }),
  okx: new ccxt.okx()
};

async function fetchFundingRates(exchangeId = "binance") {
  try {
    // CCXT does not support MEXC funding rates yet, use direct REST API
    if (exchangeId === 'mexc') {
      const response = await fetch("https://contract.mexc.com/api/v1/contract/funding_rate");
      const json = await response.json();
      let rates = json.data
        .filter(r => r.symbol.includes('_USDT') && r.fundingRate !== undefined)
        .map(r => ({
          symbol: r.symbol.replace('_USDT', ''),
          rate: r.fundingRate * 100,
          price: r.fairPrice || r.idxPrice || null
        }));
      rates.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));
      return rates.slice(0, 50);
    }

    const exchange = exchangeInstances[exchangeId] || exchangeInstances.binance;
    const fundingRates = await exchange.fetchFundingRates();
    
    // Convert to array and filter out irrelevant pairs
    let rates = Object.values(fundingRates)
      .filter((r) => r.symbol && r.symbol.includes("USDT") && r.fundingRate !== undefined)
      .map((r) => {
        // Handle symbols like ACE/USDT:USDT or ACE/USDT
        const baseSymbol = r.symbol.split('/')[0];
        return {
          symbol: baseSymbol,
          rawSymbol: r.symbol,
          rate: r.fundingRate * 100, // Convert to percentage
          price: r.markPrice || r.indexPrice || null
        };
      });
      
    // Sort by absolute highest funding rates (most extreme sentiment)
    rates.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));
    
    return rates.slice(0, 50);
  } catch (e) {
    console.error(`[MarketIntel] CCXT Funding Rates (${exchangeId}) fetch failed:`, e.message);
    return [];
  }
}

async function getFundingRatesData(exchangeId = 'binance') {
  const cacheKey = `funding_${exchangeId}`;
  if (cache[cacheKey] && (Date.now() - cache[cacheKey].ts) < CACHE_TTL_MS) {
    return cache[cacheKey].data;
  }
  const rates = await fetchFundingRates(exchangeId);
  if (rates.length > 0) {
    cache[cacheKey] = { data: rates, ts: Date.now() };
  }
  return rates;
}

// ─── Market Extras (News + Funding) ──────────────────────────────────────────
async function getMarketExtras(ccKey = null) {
  if (isFresh(cache.extras) && cache.extras.data.news.length > 0) {
    return cache.extras.data;
  }
  const [news, funding] = await Promise.all([
    fetchCryptoNews(null, ccKey),
    fetchFundingRates(),
  ]);
  const result = { news, funding };
  if (news.length > 0) {
    cache.extras = { data: result, ts: Date.now() };
  }
  return result;
}

// ─── Main Export: Full Market Pulse ──────────────────────────────────────────
async function getMarketPulse(cmcKey) {
  if (isFresh(cache.pulse) && cache.pulse.data.hasCMC === !!cmcKey) {
    return cache.pulse.data;
  }

  const [fearGreed, cmcGlobal, cmcTopMovers] = await Promise.all([
    fetchFearGreed(),
    cmcKey ? fetchCMCGlobal(cmcKey) : Promise.resolve(null),
    cmcKey ? fetchCMCTopMovers(cmcKey) : Promise.resolve(null),
  ]);

  const altcoinSeason = cmcTopMovers ? calculateAltcoinSeason(cmcTopMovers.coins) : null;

  const result = {
    hasCMC: !!cmcKey,
    fetchedAt: new Date().toISOString(),
    fearGreed,
    altcoinSeason,
    global: cmcGlobal,
    gainers: cmcTopMovers?.gainers || [],
    losers: cmcTopMovers?.losers || [],
    byVolume: cmcTopMovers?.byVolume || [],
    allCoins: cmcTopMovers?.coins || [],
  };

  cache.pulse = { data: result, ts: Date.now() };
  return result;
}

// ─── Build AI Context String ──────────────────────────────────────────────────
function formatNumber(n) {
  if (!n && n !== 0) return "N/A";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  return "$" + n.toFixed(2);
}

function buildAIContext(pulse) {
  if (!pulse) return "";
  const lines = [];
  const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  lines.push(`=== LIVE MARKET INTELLIGENCE (as of ${now}) ===`);

  if (pulse.fearGreed) {
    const fg = pulse.fearGreed;
    lines.push(`Fear & Greed Index: ${fg.value}/100 (${fg.label.toUpperCase()})`);
    lines.push(`  → ${fg.interpretation}`);
    if (fg.yesterdayValue !== null) {
      const dir = fg.value > fg.yesterdayValue ? "↑ up" : "↓ down";
      lines.push(`  → Yesterday: ${fg.yesterdayValue} (${fg.yesterdayLabel}) — trending ${dir}`);
    }
  }

  if (pulse.altcoinSeason) {
    const as = pulse.altcoinSeason;
    lines.push(`Altcoin Season Index: ${as.score}/100 (${as.label})`);
    lines.push(`  → ${as.interpretation}`);
    lines.push(`  → ${as.altsOutperforming}/49 top altcoins outperformed BTC in last 7 days`);
  }

  if (pulse.global) {
    const g = pulse.global;
    lines.push(`Total Crypto Market Cap: ${formatNumber(g.totalMarketCapUSD)} (${g.marketCapChange24h?.toFixed(2)}% 24h)`);
    lines.push(`24h Trading Volume: ${formatNumber(g.totalVolumeUSD)}`);
    lines.push(`BTC Dominance: ${g.btcDominance?.toFixed(1)}% | ETH Dominance: ${g.ethDominance?.toFixed(1)}%`);
  }

  if (pulse.gainers?.length > 0) {
    const top5 = pulse.gainers.slice(0, 5).map((c) => `${c.symbol} +${c.change24h?.toFixed(1)}%`).join(", ");
    lines.push(`Top Gainers (24h): ${top5}`);
  }

  if (pulse.losers?.length > 0) {
    const top5 = pulse.losers.slice(0, 5).map((c) => `${c.symbol} ${c.change24h?.toFixed(1)}%`).join(", ");
    lines.push(`Top Losers (24h): ${top5}`);
  }

  if (pulse.byVolume?.length > 0) {
    const top5 = pulse.byVolume.slice(0, 5).map((c) => `${c.symbol} (${formatNumber(c.volume24h)})`).join(", ");
    lines.push(`Highest Volume (24h): ${top5}`);
  }

  lines.push(`=== END INTELLIGENCE ===`);
  return lines.join("\n");
}

// ---- NEW: Open Interest Fetcher ----
async function getOpenInterestData(exchangeId = 'binance') {
  try {
    // ALWAYS use Binance for Open Interest (Global Truth)
    // Binance accounts for ~60% of derivative volume. Even if funding is pulled from MEXC,
    // Binance's OI provides the most accurate and reliable representation of the sheer money betting.
    const binanceExchange = exchangeInstances.binance;
    
    // We only fetch OI for the top extreme funding rates (top 5 positive, top 5 negative)
    const rates = await getFundingRatesData(exchangeId);
    if (!rates || rates.length === 0) return [];
    
    // Sort by absolute rate to get the most extreme ones
    const sortedRates = [...rates].sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));
    const extremeRates = sortedRates.slice(0, 10);
    
    const oiData = [];
    for (const r of extremeRates) {
      try {
        let symbolWithUsdt = `${r.symbol}/USDT:USDT`;
        const oiInfo = await binanceExchange.fetchOpenInterest(symbolWithUsdt);
        const oiValue = oiInfo ? (oiInfo.openInterestValue || oiInfo.openInterestAmount || oiInfo.baseVolume || 0) : 0;
        oiData.push({ symbol: r.symbol, rate: r.rate, oi: oiValue });
        
        // Sleep slightly to prevent hitting Binance API rate limits when fetching multiple symbols
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        oiData.push({ symbol: r.symbol, rate: r.rate, oi: 0 });
      }
    }
    
    // Filter out coins that have 0 OI (meaning they aren't on Binance or CCXT failed)
    return oiData.filter(d => d.oi > 0);
  } catch (e) {
    console.error(`[MarketIntel] OI fetch failed for ${exchangeId}:`, e.message);
    return [];
  }
}

// ---- NEW: Specific Coin Derivatives for Watchlist ----
async function getSpecificCoinDerivatives(symbol, exchangeId = 'binance') {
  try {
    const binanceExchange = exchangeInstances.binance;
    let fundingRate = null;
    let openInterest = null;
    const symbolWithUsdt = `${symbol.toUpperCase()}/USDT:USDT`;

    // 1. Fetch Funding Rate
    // For MEXC, the ccxt implementation lacks funding rate, so we rely on our global array cache.
    // If it's not in the top 50, we might miss it. But let's try direct CCXT for other exchanges.
    try {
      if (exchangeId === 'mexc') {
        // Fallback to Binance funding if on MEXC just for the specific query since we don't have a single-coin MEXC REST endpoint
        // Or we can check our cache
        const allRates = await getFundingRatesData('mexc');
        const found = allRates.find(r => r.symbol === symbol.toUpperCase());
        if (found) fundingRate = found.rate;
        else {
          // Fallback to Binance
          const info = await binanceExchange.fetchFundingRate(symbolWithUsdt);
          if (info && info.fundingRate !== undefined) fundingRate = info.fundingRate * 100;
        }
      } else {
        const exchange = exchangeInstances[exchangeId] || binanceExchange;
        const info = await exchange.fetchFundingRate(symbolWithUsdt);
        if (info && info.fundingRate !== undefined) fundingRate = info.fundingRate * 100;
      }
    } catch (e) {
      // Ignored, spot-only coin or not on futures
    }

    // 2. Fetch Open Interest (Always Binance)
    try {
      const oiInfo = await binanceExchange.fetchOpenInterest(symbolWithUsdt);
      if (oiInfo) {
        openInterest = oiInfo.openInterestValue || oiInfo.openInterestAmount || oiInfo.baseVolume || 0;
      }
    } catch (e) {
      // Ignored
    }

    return {
      fundingRate: fundingRate,
      openInterest: openInterest
    };
  } catch (e) {
    return { fundingRate: null, openInterest: null };
  }
}

// ─── Historical Funding Rate (Sparklines) ────────────────────────────────────
/**
 * Fetch the last N funding rate periods for a single symbol.
 * Returns array of { timestamp, rate } sorted oldest → newest.
 * @param {string} symbol - e.g. "BTC"
 * @param {string} exchangeId - ccxt exchange id
 * @param {number} limit - number of historical periods (default 8)
 */
async function fetchFundingRateHistory(symbol, exchangeId = 'binance', limit = 8) {
  try {
    const exchange = exchangeInstances[exchangeId] || exchangeInstances.binance;
    // Use rawSymbol directly if it contains a slash, otherwise fallback to guessing
    const symbolWithUsdt = symbol.includes('/') ? symbol : `${symbol.toUpperCase()}/USDT:USDT`;

    if (typeof exchange.fetchFundingRateHistory !== 'function') return [];

    const history = await exchange.fetchFundingRateHistory(symbolWithUsdt, undefined, limit);
    if (!Array.isArray(history)) return [];

    return history
      .slice(-limit)
      .map(h => ({
        timestamp: h.timestamp,
        rate: h.fundingRate !== undefined ? h.fundingRate * 100 : null,
      }))
      .filter(h => h.rate !== null);
  } catch (e) {
    console.warn(`[MarketIntel] Funding history failed for ${symbol} on ${exchangeId}:`, e.message);
    return [];
  }
}

module.exports = {
  getMarketPulse,
  getMarketExtras,
  getFundingRatesData,
  getOpenInterestData,
  getSpecificCoinDerivatives,
  fetchFundingRateHistory,
  fetchCMCCoin,
  fetchLunarCrushSocial,
  fetchCryptoNews,
  buildAIContext,
  calculateAltcoinSeason,
};
