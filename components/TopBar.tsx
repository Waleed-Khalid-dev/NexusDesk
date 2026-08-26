"use client";

import { TOP_COINS } from "@/lib/symbols";
import { useSelectedSymbol } from "@/lib/useSelectedSymbol";
import { SymbolSearch } from "./SymbolSearch";

const QUICK = TOP_COINS.slice(0, 8);

type TopBarProps = {
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
};

export function TopBar({
  leftCollapsed,
  rightCollapsed,
  onToggleLeft,
  onToggleRight,
}: TopBarProps) {
  const {
    coin,
    setSymbol,
    openFullTradingView,
    openFullCoinGlass,
    fullTvOpen,
    fullCgOpen,
  } = useSelectedSymbol();

  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-zinc-800 bg-zinc-950/95 px-3 py-2 backdrop-blur sm:px-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 text-sm font-bold text-white shadow-lg shadow-emerald-900/30">
            ₿
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
              Crypto Hub
            </h1>
            <p className="text-[10px] text-zinc-500">
              Bubbles · Chart · Liq heatmap
            </p>
          </div>
        </div>

        <SymbolSearch />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Panel toggles (desktop) */}
          <div className="hidden items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5 md:flex">
            <button
              type="button"
              onClick={onToggleLeft}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                leftCollapsed
                  ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  : "bg-zinc-800 text-emerald-400"
              }`}
              title={leftCollapsed ? "Show bubbles panel" : "Hide bubbles panel"}
            >
              {leftCollapsed ? "Show left" : "Hide left"}
            </button>
            <button
              type="button"
              onClick={onToggleRight}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                rightCollapsed
                  ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  : "bg-zinc-800 text-emerald-400"
              }`}
              title={
                rightCollapsed ? "Show heatmap panel" : "Hide heatmap panel"
              }
            >
              {rightCollapsed ? "Show right" : "Hide right"}
            </button>
          </div>

          <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 sm:flex">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
              Active
            </span>
            <span className="text-sm font-bold text-emerald-400">
              {coin.ticker}
            </span>
            <span className="text-xs text-zinc-500">{coin.name}</span>
          </div>

          <button
            type="button"
            onClick={openFullTradingView}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              fullTvOpen
                ? "border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25"
                : "bg-sky-600 text-white hover:bg-sky-500"
            }`}
            title="Opens full TradingView so you can log in and use layouts/indicators."
          >
            {fullTvOpen ? "Focus TradingView" : "Open TradingView"}
          </button>

          <button
            type="button"
            onClick={openFullCoinGlass}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              fullCgOpen
                ? "border border-orange-500/40 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25"
                : "bg-orange-600 text-white hover:bg-orange-500"
            }`}
            title="Opens full CoinGlass for login and heatmap. Google login cannot run inside an embed."
          >
            {fullCgOpen ? "Focus CoinGlass" : "Open CoinGlass"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-zinc-600">
          Quick
        </span>
        {QUICK.map((c) => {
          const active = c.ticker === coin.ticker;
          return (
            <button
              key={c.ticker}
              type="button"
              onClick={() => setSymbol(c.ticker)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                active
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
              }`}
            >
              {c.ticker}
            </button>
          );
        })}
        <span className="ml-2 hidden text-[10px] text-zinc-600 lg:inline">
          Edge ‹ › buttons collapse side panels · CoinGlass login needs full window
        </span>
      </div>
    </header>
  );
}
