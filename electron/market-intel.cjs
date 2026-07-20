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
  coinCache: {},      // { [symbol]: { data, ts } }
  socialCache: {},    // { [symbol]: { data, ts } }
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
// Uses LunarCrush public v4 API — no key required for basic coin metrics
async function fetchLunarCrushSocial(symbol) {
  if (isFresh(cache.socialCache[symbol])) return cache.socialCache[symbol].data;
  try {
    const data = await httpGet(
      `https://lunarcrush.com/api4/public/coins/${symbol.toLowerCase()}/v1`
    );
    const c = data.data;
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

module.exports = {
  getMarketPulse,
  fetchCMCCoin,
  fetchLunarCrushSocial,
  buildAIContext,
  calculateAltcoinSeason,
};
