"use client";

import { CRYPTO_BUBBLES_URL } from "@/lib/symbols";

export function CryptoBubblesPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Crypto Bubbles
          </h2>
          <p className="text-[10px] text-zinc-600">
            Live from cryptobubbles.net
          </p>
        </div>
        <a
          href={CRYPTO_BUBBLES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-medium text-emerald-500/90 hover:text-emerald-400"
        >
          Open ↗
        </a>
      </div>
      <div className="relative min-h-0 flex-1 bg-black">
        <iframe
          title="Crypto Bubbles"
          src={CRYPTO_BUBBLES_URL}
          className="absolute inset-0 h-full w-full border-0"
          allow="fullscreen; clipboard-write"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </section>
  );
}
