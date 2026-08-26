"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CoinGlassPanel } from "./CoinGlassPanel";
import { CryptoBubblesPanel } from "./CryptoBubblesPanel";
import { TopBar } from "./TopBar";
import { TradingViewPanel } from "./TradingViewPanel";

const LEFT_DEFAULT = 22;
const RIGHT_DEFAULT = 28;
const MIN_SIDE = 14;
const MAX_SIDE = 40;
const MIN_CENTER = 28;
const COLLAPSE_KEY = "crypto-dashboard:panels";

type PanelState = {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  leftPct: number;
  rightPct: number;
};

export function DashboardShell() {
  const [leftPct, setLeftPct] = useState(LEFT_DEFAULT);
  const [rightPct, setRightPct] = useState(RIGHT_DEFAULT);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const dragging = useRef<"left" | "right" | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  // Restore collapse + sizes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<PanelState>;
      if (typeof saved.leftPct === "number") setLeftPct(saved.leftPct);
      if (typeof saved.rightPct === "number") setRightPct(saved.rightPct);
      if (typeof saved.leftCollapsed === "boolean")
        setLeftCollapsed(saved.leftCollapsed);
      if (typeof saved.rightCollapsed === "boolean")
        setRightCollapsed(saved.rightCollapsed);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const payload: PanelState = {
        leftCollapsed,
        rightCollapsed,
        leftPct,
        rightPct,
      };
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [leftCollapsed, rightCollapsed, leftPct, rightPct]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !shellRef.current) return;
      const rect = shellRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;

      const effectiveRight = rightCollapsed ? 0 : rightPct;
      const effectiveLeft = leftCollapsed ? 0 : leftPct;

      if (dragging.current === "left" && !leftCollapsed) {
        const maxLeft = 100 - effectiveRight - MIN_CENTER;
        setLeftPct(
          Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.min(pct, maxLeft)))
        );
      } else if (dragging.current === "right" && !rightCollapsed) {
        const fromRight = 100 - pct;
        const maxRight = 100 - effectiveLeft - MIN_CENTER;
        setRightPct(
          Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.min(fromRight, maxRight)))
        );
      }
    },
    [leftPct, rightPct, leftCollapsed, rightCollapsed]
  );

  const stopDrag = useCallback(() => {
    dragging.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
    };
  }, [onPointerMove, stopDrag]);

  function startDrag(side: "left" | "right") {
    dragging.current = side;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const effectiveLeft = leftCollapsed ? 0 : leftPct;
  const effectiveRight = rightCollapsed ? 0 : rightPct;
  const centerPct = 100 - effectiveLeft - effectiveRight;

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <TopBar
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onToggleLeft={() => setLeftCollapsed((v) => !v)}
        onToggleRight={() => setRightCollapsed((v) => !v)}
      />

      {/* Desktop / wide: 3 columns */}
      <div ref={shellRef} className="relative hidden min-h-0 flex-1 md:flex">
        {/* Left panel */}
        <div
          style={{
            width: leftCollapsed ? 0 : `${leftPct}%`,
            opacity: leftCollapsed ? 0 : 1,
          }}
          className="min-w-0 shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out"
          aria-hidden={leftCollapsed}
        >
          <div className="h-full" style={{ width: "100%", minWidth: 200 }}>
            <CryptoBubblesPanel />
          </div>
        </div>

        {/* Left edge toggle + resize */}
        <div className="relative z-20 flex shrink-0">
          {leftCollapsed ? (
            <EdgeToggle
              side="left"
              collapsed
              onClick={() => setLeftCollapsed(false)}
              label="Show bubbles panel"
            />
          ) : (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize bubbles panel"
                onPointerDown={() => startDrag("left")}
                className="w-1 cursor-col-resize bg-zinc-800 hover:bg-emerald-500/50 active:bg-emerald-500"
              />
              <EdgeToggle
                side="left"
                collapsed={false}
                onClick={() => setLeftCollapsed(true)}
                label="Hide bubbles panel"
              />
            </>
          )}
        </div>

        {/* Center */}
        <div
          style={{ width: `${centerPct}%` }}
          className="relative min-w-0 flex-1 transition-[width] duration-300 ease-in-out"
        >
          <TradingViewPanel />
        </div>

        {/* Right edge toggle + resize */}
        <div className="relative z-20 flex shrink-0">
          {rightCollapsed ? (
            <EdgeToggle
              side="right"
              collapsed
              onClick={() => setRightCollapsed(false)}
              label="Show heatmap panel"
            />
          ) : (
            <>
              <EdgeToggle
                side="right"
                collapsed={false}
                onClick={() => setRightCollapsed(true)}
                label="Hide heatmap panel"
              />
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize heatmap panel"
                onPointerDown={() => startDrag("right")}
                className="w-1 cursor-col-resize bg-zinc-800 hover:bg-emerald-500/50 active:bg-emerald-500"
              />
            </>
          )}
        </div>

        {/* Right panel */}
        <div
          style={{
            width: rightCollapsed ? 0 : `${rightPct}%`,
            opacity: rightCollapsed ? 0 : 1,
          }}
          className="min-w-0 shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out"
          aria-hidden={rightCollapsed}
        >
          <div className="h-full" style={{ width: "100%", minWidth: 220 }}>
            <CoinGlassPanel />
          </div>
        </div>
      </div>

      <MobilePanels />
    </div>
  );
}

function EdgeToggle({
  side,
  collapsed,
  onClick,
  label,
}: {
  side: "left" | "right";
  collapsed: boolean;
  onClick: () => void;
  label: string;
}) {
  // When expanded: chevron points outward (hide). When collapsed: points inward (show).
  const icon =
    side === "left"
      ? collapsed
        ? "›"
        : "‹"
      : collapsed
        ? "‹"
        : "›";

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`group flex h-full w-5 shrink-0 flex-col items-center justify-center border-zinc-800 bg-zinc-900/90 text-zinc-500 transition-colors hover:bg-emerald-600/20 hover:text-emerald-400 ${
        side === "left" ? "border-r" : "border-l"
      }`}
    >
      <span className="flex h-14 w-4 items-center justify-center rounded-md bg-zinc-800 text-base font-bold leading-none text-zinc-300 shadow-sm ring-1 ring-zinc-700 group-hover:bg-emerald-600 group-hover:text-white group-hover:ring-emerald-500">
        {icon}
      </span>
      <span
        className="mt-2 max-h-24 overflow-hidden text-[9px] font-semibold uppercase tracking-widest text-zinc-600 group-hover:text-emerald-500/80"
        style={{
          writingMode: "vertical-rl",
          transform: side === "left" ? "rotate(180deg)" : undefined,
        }}
      >
        {side === "left"
          ? collapsed
            ? "Bubbles"
            : "Hide"
          : collapsed
            ? "Heatmap"
            : "Hide"}
      </span>
    </button>
  );
}

function MobilePanels() {
  const [tab, setTab] = useState<"bubbles" | "chart" | "heatmap">("chart");

  return (
    <div className="flex min-h-0 flex-1 flex-col md:hidden">
      <div className="flex shrink-0 border-b border-zinc-800">
        {(
          [
            ["bubbles", "Bubbles"],
            ["chart", "Chart"],
            ["heatmap", "Heatmap"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 py-2 text-xs font-semibold ${
              tab === id
                ? "border-b-2 border-emerald-500 text-emerald-400"
                : "text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "bubbles" && <CryptoBubblesPanel />}
        {tab === "chart" && <TradingViewPanel />}
        {tab === "heatmap" && <CoinGlassPanel />}
      </div>
    </div>
  );
}
