# NexusDesk 🚀

**A premium desktop crypto trading command center** powered by AI, built with Electron.

NexusDesk combines live market intelligence, cross-exchange arbitrage scanning, and an AI Co-Pilot (Google Gemini) into a single, beautiful dark-mode desktop application.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Co-Pilot** | Google Gemini-powered assistant with live market context injected automatically |
| 📊 **Market Pulse** | Real-time Fear & Greed Index, Altcoin Season Index, BTC dominance, top gainers/losers |
| 🔄 **Arbitrage Scanner** | Cross-exchange spread detection for Single Pair, Top 100 Gainers, Top 100 Losers |
| 🏦 **Command Center Vault** | Encrypted API key management for all exchanges + AI providers |
| 🛡️ **Trade Safety System** | Manual confirmation modal — AI can never execute a trade without your click |
| 📈 **Live Portfolio** | Real-time balance fetching from all connected exchanges (Spot + Futures) |
| 🌍 **Market Intelligence** | CoinMarketCap + LunarCrush integration: market cap, volume, supply, social scores |

---

## 🛡️ Security Model

Your API keys are **never stored in plain text**.

- All keys are encrypted using **Windows DPAPI** (`electron.safeStorage`) — the same system Windows uses for browser passwords
- Encrypted blobs are stored in `%AppData%\NexusDesk\` — **outside the project folder**
- Even if someone clones this repo, they get zero keys — there is nothing to steal from the code
- Trade execution requires a **physical toggle** in the Vault + a **manual confirm click** in the chat modal

---

## 🚀 Getting Started

### Prerequisites
- [Node.js 18+](https://nodejs.org/)
- [Git](https://git-scm.com/)
- Windows 10/11 (required for `safeStorage` DPAPI encryption)

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/NexusDesk.git
cd NexusDesk
npm install
npm run desktop
```

### API Keys Required (set in the Vault after launching)

| Key | Required | Get it at |
|---|---|---|
| **Google Gemini API** | ✅ Yes | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Binance API** | For trading | [binance.com/en/my/settings/api-management](https://www.binance.com/en/my/settings/api-management) |
| **CoinMarketCap API** | For market data | [coinmarketcap.com/api](https://coinmarketcap.com/api/) |
| **LunarCrush API** | For social data | [lunarcrush.com](https://lunarcrush.com/) |
| **Other exchanges** | Optional | Via CCXT (MEXC, KuCoin, etc.) |

> All keys are entered in the **Command Center Vault** (⚙️ icon) after launch — never in `.env` files.

---

## 🏗️ Architecture

```
NexusDesk/
├── electron/
│   ├── main.cjs          # Main process: IPC handlers, security, trade engine
│   ├── market-intel.cjs  # Market intelligence: F&G, CMC, LunarCrush (cached)
│   ├── ai-chat.html      # AI Co-Pilot panel with Market Pulse strip
│   ├── portfolio.html    # Command Center Vault (API key management)
│   ├── arbitrage.html    # Cross-exchange arbitrage scanner
│   ├── control.html      # Main control bar
│   ├── preload.cjs       # Electron preload script
│   └── splitter.html     # Layout splitter handle
├── package.json
├── start.bat             # Windows quick-launch script
└── .gitignore
```

---

## 🤖 AI Co-Pilot Capabilities

The AI knows — **in real time** — about:
- Your live portfolio balance across all connected exchanges
- Fear & Greed Index with interpretation
- Altcoin Season Index (calculated from CMC top 50 data)
- Total crypto market cap + BTC/ETH dominance
- Top 10 gainers and losers from CMC top 100
- Specific coin data on demand (market cap, supply, FDV, volume, LunarCrush social score)

Example prompts:
- *"What are the top gainers today and should I trade any of them?"*
- *"Is this a good time to buy or should I wait? Use the F&G and altcoin season data."*
- *"Analyze SOL — give me market data and social sentiment."*
- *"Calculate the arbitrage opportunity for ETH/USDT across my exchanges."*

---

## ⚠️ Disclaimer

This is a personal trading tool, not financial advice. Crypto trading carries significant risk. Always do your own research. The developers are not responsible for any financial losses.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
