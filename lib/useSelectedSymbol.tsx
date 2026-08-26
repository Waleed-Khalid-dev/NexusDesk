"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  DEFAULT_TICKER,
  coinGlassHeatmapUrl,
  resolveCoin,
  tradingViewChartUrl,
  type CoinMeta,
  DEFAULT_EXCHANGE,
} from "./symbols";

type SelectedSymbolContextValue = {
  coin: CoinMeta;
  exchange: string;
  setSymbol: (input: string) => void;
  setExchange: (input: string) => void;
  openFullTradingView: () => void;
  openFullCoinGlass: () => void;
  fullTvOpen: boolean;
  fullCgOpen: boolean;
};

const SelectedSymbolContext = createContext<SelectedSymbolContextValue | null>(
  null
);

const STORAGE_KEY = "crypto-dashboard:symbol";
const EXCHANGE_KEY = "crypto-dashboard:exchange";

function navigateOwnedWindow(
  ref: MutableRefObject<Window | null>,
  url: string,
  windowName: string
): Window | null {
  const existing = ref.current;
  if (existing && !existing.closed) {
    try {
      existing.focus();
      existing.location.href = url;
      return existing;
    } catch {
      /* reopen below */
    }
  }
  const win = window.open(url, windowName);
  ref.current = win;
  return win;
}

export function SelectedSymbolProvider({ children }: { children: ReactNode }) {
  const [exchange, setExchangeState] = useState<string>(DEFAULT_EXCHANGE);
  const [coin, setCoin] = useState<CoinMeta>(() => resolveCoin(DEFAULT_TICKER, DEFAULT_EXCHANGE));
  const [fullTvOpen, setFullTvOpen] = useState(false);
  const [fullCgOpen, setFullCgOpen] = useState(false);
  const tvWindowRef = useRef<Window | null>(null);
  const cgWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    try {
      const savedEx = localStorage.getItem(EXCHANGE_KEY);
      const ex = savedEx || DEFAULT_EXCHANGE;
      setExchangeState(ex);

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCoin(resolveCoin(saved, ex));
    } catch {
      /* ignore */
    }
  }, []);

  const syncExternalWindows = useCallback((next: CoinMeta) => {
    const tv = tvWindowRef.current;
    if (tv && !tv.closed) {
      try {
        tv.location.href = tradingViewChartUrl(next.tradingView);
      } catch {
        tvWindowRef.current = window.open(
          tradingViewChartUrl(next.tradingView),
          "crypto-dashboard-tradingview"
        );
      }
    } else {
      tvWindowRef.current = null;
      setFullTvOpen(false);
    }

    const cg = cgWindowRef.current;
    if (cg && !cg.closed) {
      try {
        cg.location.href = coinGlassHeatmapUrl(next.coinGlass, exchange);
      } catch {
        cgWindowRef.current = window.open(
          coinGlassHeatmapUrl(next.coinGlass, exchange),
          "crypto-dashboard-coinglass"
        );
      }
    } else {
      cgWindowRef.current = null;
      setFullCgOpen(false);
    }
  }, []);

  const setSymbol = useCallback(
    (input: string) => {
      const next = resolveCoin(input, exchange);
      setCoin(next);
      try {
        localStorage.setItem(STORAGE_KEY, next.ticker);
      } catch {
        /* ignore */
      }
      syncExternalWindows(next);
    },
    [syncExternalWindows, exchange]
  );

  const setExchange = useCallback(
    (input: string) => {
      setExchangeState(input);
      try {
        localStorage.setItem(EXCHANGE_KEY, input);
      } catch {
        /* ignore */
      }
      const next = resolveCoin(coin.ticker, input);
      setCoin(next);
      syncExternalWindows(next);
    },
    [syncExternalWindows, coin.ticker]
  );

  const openFullTradingView = useCallback(() => {
    const win = navigateOwnedWindow(
      tvWindowRef,
      tradingViewChartUrl(coin.tradingView),
      "crypto-dashboard-tradingview"
    );
    setFullTvOpen(Boolean(win && !win.closed));
  }, [coin.tradingView]);

  const openFullCoinGlass = useCallback(() => {
    const win = navigateOwnedWindow(
      cgWindowRef,
      coinGlassHeatmapUrl(coin.coinGlass, exchange),
      "crypto-dashboard-coinglass"
    );
    setFullCgOpen(Boolean(win && !win.closed));
  }, [coin.coinGlass, exchange]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!tvWindowRef.current || tvWindowRef.current.closed) {
        tvWindowRef.current = null;
        setFullTvOpen((v) => (v ? false : v));
      }
      if (!cgWindowRef.current || cgWindowRef.current.closed) {
        cgWindowRef.current = null;
        setFullCgOpen((v) => (v ? false : v));
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  const value = useMemo(
    () => ({
      coin,
      exchange,
      setSymbol,
      setExchange,
      openFullTradingView,
      openFullCoinGlass,
      fullTvOpen,
      fullCgOpen,
    }),
    [
      coin,
      exchange,
      setSymbol,
      setExchange,
      openFullTradingView,
      openFullCoinGlass,
      fullTvOpen,
      fullCgOpen,
    ]
  );

  return (
    <SelectedSymbolContext.Provider value={value}>
      {children}
    </SelectedSymbolContext.Provider>
  );
}

export function useSelectedSymbol(): SelectedSymbolContextValue {
  const ctx = useContext(SelectedSymbolContext);
  if (!ctx) {
    throw new Error("useSelectedSymbol must be used within SelectedSymbolProvider");
  }
  return ctx;
}
