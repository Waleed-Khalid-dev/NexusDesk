"use client";

import { useEffect, useRef } from "react";
import { useSelectedSymbol } from "@/lib/useSelectedSymbol";

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => unknown;
    };
  }
}

const SCRIPT_ID = "tradingview-widget-script";
const SCRIPT_SRC =
  "https://s3.tradingview.com/tv.js";

function loadTradingViewScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.TradingView) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("TV script failed")), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load TradingView script"));
    document.head.appendChild(script);
  });
}

export function TradingViewPanel() {
  const { coin, openFullTradingView, fullTvOpen } = useSelectedSymbol();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetHostId = "tv-advanced-chart-host";

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      const host = containerRef.current;
      if (!host) return;

      // Clear previous widget DOM
      host.innerHTML = "";
      const widgetEl = document.createElement("div");
      widgetEl.id = widgetHostId;
      widgetEl.style.height = "100%";
      widgetEl.style.width = "100%";
      host.appendChild(widgetEl);

      try {
        await loadTradingViewScript();
      } catch {
        if (!cancelled) {
          host.innerHTML =
            '<div class="flex h-full items-center justify-center p-4 text-sm text-zinc-400">Failed to load TradingView chart library.</div>';
        }
        return;
      }

      if (cancelled || !window.TradingView) return;

      // eslint-disable-next-line new-cap -- TradingView constructor
      new window.TradingView.widget({
        autosize: true,
        symbol: coin.tradingView,
        interval: "60",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0b0e11",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        allow_symbol_change: true,
        details: true,
        hotlist: false,
        calendar: false,
        studies: ["Volume@tv-basicstudies", "MASimple@tv-basicstudies"],
        container_id: widgetHostId,
      });
    }

    mount();

    return () => {
      cancelled = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [coin.tradingView]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-zinc-950">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
            TradingView
          </h2>
          <p className="text-[10px] text-zinc-600">
            {coin.tradingView}
            {fullTvOpen ? " · full window linked" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-zinc-600 lg:inline">
            Full login / layouts → use full site window
          </span>
          <button
            type="button"
            onClick={openFullTradingView}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-sky-400 hover:border-sky-500/40 hover:bg-zinc-800"
          >
            {fullTvOpen ? "Focus full TV" : "Login on full TV"}
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-[#0b0e11]">
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      </div>
    </section>
  );
}
