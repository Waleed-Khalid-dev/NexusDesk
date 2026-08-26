"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchCoins, type CoinMeta } from "@/lib/symbols";
import { useSelectedSymbol } from "@/lib/useSelectedSymbol";

export function SymbolSearch() {
  const { coin, exchange, setSymbol, setExchange } = useSelectedSymbol();
  const [query, setQuery] = useState(coin.ticker);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CoinMeta[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    setQuery(coin.ticker);
  }, [coin.ticker]);

  useEffect(() => {
    setResults(searchCoins(query));
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function apply(input: string) {
    setSymbol(input);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 max-w-md">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-3 py-1.5 focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/30">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Exchange
        </span>
        <select
          value={exchange}
          onChange={(e) => setExchange(e.target.value)}
          className="bg-transparent text-sm font-semibold tracking-wide text-zinc-100 outline-none uppercase cursor-pointer mr-2"
        >
          <option className="text-zinc-900" value="BINANCE">BINANCE</option>
          <option className="text-zinc-900" value="BYBIT">BYBIT</option>
          <option className="text-zinc-900" value="MEXC">MEXC</option>
          <option className="text-zinc-900" value="OKX">OKX</option>
          <option className="text-zinc-900" value="COINBASE">COINBASE</option>
          <option className="text-zinc-900" value="KUCOIN">KUCOIN</option>
          <option className="text-zinc-900" value="BITGET">BITGET</option>
        </select>

        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Symbol
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply(query);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="BTC, ETH, SOL…"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold tracking-wide text-zinc-100 outline-none placeholder:text-zinc-600"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => apply(query)}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
        >
          Go
        </button>
      </div>

      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40"
        >
          {results.map((item) => (
            <li key={item.ticker}>
              <button
                type="button"
                role="option"
                aria-selected={item.ticker === coin.ticker}
                onClick={() => apply(item.ticker)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-800 ${
                  item.ticker === coin.ticker ? "bg-zinc-800/80" : ""
                }`}
              >
                <span className="font-semibold text-zinc-100">{item.ticker}</span>
                <span className="text-xs text-zinc-500">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
