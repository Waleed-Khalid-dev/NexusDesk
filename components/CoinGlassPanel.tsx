"use client";

import { useMemo, useState } from "react";
import { coinGlassHeatmapUrl } from "@/lib/symbols";
import { useSelectedSymbol } from "@/lib/useSelectedSymbol";

/**
 * Browsers block CoinGlass/Google login inside iframes (403).
 * Reliable same-screen login: use the Electron desktop app (`npm run desktop`).
 * Web fallback: full-window open that stays symbol-synced.
 */
export function CoinGlassPanel() {
  const { coin, openFullCoinGlass, fullCgOpen } = useSelectedSymbol();
  const src = useMemo(() => coinGlassHeatmapUrl(coin.coinGlass), [coin.coinGlass]);
  const [showEmbed, setShowEmbed] = useState(false);

  return (
    <section className="flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Liq Heatmap
          </h2>
          <p className="text-[10px] text-zinc-600">
            CoinGlass · {coin.coinGlass}
            {fullCgOpen ? " · window linked" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEmbed((v) => !v)}
            className="text-[10px] font-medium text-zinc-500 hover:text-zinc-300"
          >
            {showEmbed ? "Hide embed" : "Try embed"}
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-emerald-500/90 hover:text-emerald-400"
          >
            Open ↗
          </a>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-zinc-950">
        {showEmbed ? (
          <div className="absolute inset-0 flex flex-col">
            <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-200/90">
              Embed cannot log in. For same-screen logged-in heatmap run{" "}
              <code className="rounded bg-black/30 px-1">npm run desktop</code>
            </div>
            <iframe
              key={src}
              title={`CoinGlass liquidation heatmap ${coin.ticker}`}
              src={src}
              className="min-h-0 w-full flex-1 border-0 bg-black"
              allow="fullscreen; clipboard-write"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-rose-500/20 text-2xl ring-1 ring-orange-500/30">
              🔥
            </div>
            <div className="max-w-sm space-y-2">
              <h3 className="text-sm font-semibold text-zinc-100">
                Same-screen login = Desktop app
              </h3>
              <p className="text-xs leading-relaxed text-zinc-500">
                CoinGlass + Google block login inside browser iframes (the 403
                you saw). That is a browser security limit — not a bug we can
                patch on the website version.
              </p>
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-left text-[11px] leading-relaxed text-emerald-100/90">
                <p className="font-semibold text-emerald-300">Reliable fix</p>
                <p className="mt-1 text-emerald-100/80">
                  Run the desktop shell. It loads Bubbles, TradingView, and
                  CoinGlass as <strong>real browser panes</strong> (not
                  iframes). Login works and stays on one screen.
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-black/40 px-2 py-1.5 font-mono text-[10px] text-emerald-200">
                  cd crypto-dashboard{"\n"}npm install{"\n"}npm run desktop
                </pre>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={openFullCoinGlass}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                  fullCgOpen
                    ? "border border-orange-500/40 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25"
                    : "bg-orange-600 text-white hover:bg-orange-500"
                }`}
              >
                {fullCgOpen
                  ? `Focus CoinGlass window · ${coin.ticker}`
                  : `Web fallback: open CoinGlass · ${coin.ticker}`}
              </button>
              <p className="max-w-xs text-[10px] text-zinc-600">
                Web fallback opens a separate window (login works, not embedded).
                Desktop app keeps everything on one screen.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowEmbed(true)}
              className="text-[10px] text-zinc-500 underline hover:text-zinc-300"
            >
              Try broken embed preview anyway
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
