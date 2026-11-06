'use client';

import clsx from 'clsx';
import { GROOT } from '@/config/agents.config';
import { Children, ReactNode, useRef, useState } from 'react';

// Mirrors plant_state.status() in agent/voice_agent/plant_state.py.
export interface PlantStatus {
  objectives: string;
  plantsInDistress: string[];
  lastWateredAt: string | null;
  waterMl: number;
  leafCount: number | null;
  selfieAt: string | null;
  tools: string[];
  walletAddress: string | null;
  ensName: string | null;
}

export interface Selfie {
  at: string;
  image: string;
}

export const ago = (iso: string | null | undefined) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};

export const CARD = 'relative h-full w-full overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]';

export function Card({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <>
      <p className="mb-1.5 text-[12px] font-semibold">{title}</p>
      {children}
    </>
  );
  const cls = `${CARD} flex flex-col p-3 text-left font-inter text-[12px] leading-relaxed text-[#273339]`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-colors hover:bg-[#FAFBFB]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** One card at a time; dots below rotate. A sideways swipe also rotates. Hidden cards stay mounted (camera keeps running). */
export function CardStack({ tabs, children }: { tabs: string[]; children: ReactNode }) {
  const cards = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const n = cards.length;

  return (
    <section className="flex flex-col items-center gap-2.5">
      <div
        className="relative aspect-[4/3] w-full touch-pan-y select-none"
        onPointerDown={e => (startX.current = e.clientX)}
        onPointerUp={e => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) > 40) setIndex(i => (i + (dx < 0 ? 1 : -1) + n) % n);
        }}
      >
        {cards.map((card, i) => (
          <div
            key={i}
            aria-hidden={i !== index}
            className={clsx('absolute inset-0 transition-opacity duration-200', i === index ? 'opacity-100' : 'pointer-events-none opacity-0')}
          >
            {card}
          </div>
        ))}
      </div>
      <div role="tablist" className="flex gap-1.5">
        {cards.map((_, i) => (
          <button
            key={i}
            role="tab"
            type="button"
            aria-selected={i === index}
            aria-label={tabs[i]}
            title={tabs[i]}
            onClick={() => setIndex(i)}
            className="flex h-4 w-4 items-center justify-center"
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full transition-colors', i === index ? 'bg-[#273339]' : 'bg-[#C9D3D5] hover:bg-[#8E989C]')} />
          </button>
        ))}
      </div>
    </section>
  );
}

/** Right-hand column of card stacks. Collapses to nothing but a chevron. */
export function Sidebar({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className={clsx('relative z-20 h-full shrink-0 transition-[width] duration-300', open ? 'w-[240px]' : 'w-0')}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        className="absolute right-full top-1/2 -translate-y-1/2 flex h-8 w-6 items-center justify-center text-[#8E989C] hover:text-[#273339]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d={open ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Kept mounted when collapsed so the camera keeps watching. */}
      <div className={clsx('h-full w-[240px] space-y-6 overflow-y-auto py-5 pr-5', !open && 'invisible')}>{children}</div>
    </aside>
  );
}

export function SelfieCard({ selfie }: { selfie: Selfie | null }) {
  return (
    <div className={`${CARD} bg-[#171D21]`}>
      {selfie ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={selfie.image} alt={`${GROOT.name} latest selfie`} className="h-full w-full object-cover" />
      ) : (
        <p className="flex h-full items-center justify-center p-2 text-center font-inter text-[13px] text-white/70">No selfie yet</p>
      )}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 font-inter text-[11px] text-white">
        selfie · {ago(selfie?.at)}
      </span>
    </div>
  );
}

export function ToolsCard({ tools }: { tools: string[] }) {
  return (
    <Card title="Tools">
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 font-mono text-[12px]">
        {tools.map(t => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Card>
  );
}

export function MemoryCard({ status }: { status: PlantStatus | null }) {
  const lines = status ? [...status.objectives.split('\n').filter(Boolean), `Watered ${ago(status.lastWateredAt)}`] : [];
  return (
    <Card title="Memory">
      <ul className="min-h-0 flex-1 list-disc space-y-0.5 overflow-y-auto pl-3">
        {lines.map(l => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </Card>
  );
}

export function WalletCard({ address, ensName }: { address: string | null | undefined; ensName?: string | null }) {
  return (
    <Card title="Wallet">
      {ensName && <p className="mb-1 font-semibold">{ensName}</p>}
      {address ? (
        <p className="break-all font-mono text-[11px]" title={address}>
          {address}
        </p>
      ) : (
        <p className="text-[#8E989C]">No wallet set</p>
      )}
    </Card>
  );
}

export function ForestCard() {
  return (
    <Card title="autoforest.eth">
      <ul className="space-y-0.5">
        <li>groot.autoforest.eth (me)</li>
        <li>sapling.autoforest.eth</li>
      </ul>
    </Card>
  );
}
