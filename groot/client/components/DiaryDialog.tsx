'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { ago } from '@/components/ObjectivesCard';
import { GROOT } from '@/config/agents.config';

export interface DiaryEntry {
  at: string;
  kind: 'decision' | 'thought' | 'action' | 'sleep' | 'wake' | 'conversation' | 'forest';
  text: string;
  thought?: string;
  ms?: number;
}

export interface MindStep {
  state: 'awake' | 'sleeping';
  step: string;
  at: string;
  sleepMin?: number;
  kind?: 'thinking' | 'decision';
  thought?: string;
  ms?: number;
}

const KIND_LABEL: Record<DiaryEntry['kind'], string> = {
  decision: 'decided',
  wake: 'woke',
  thought: 'thought',
  action: 'did',
  sleep: 'slept',
  conversation: 'talked',
  forest: 'forest',
};

const KIND_DOT: Record<DiaryEntry['kind'], string> = {
  decision: '#2F6E3B',
  wake: '#E0B64A',
  thought: '#3F8F4E',
  action: '#4A7FB5',
  sleep: '#8E989C',
  conversation: '#D9822B',
  forest: '#C0392B',
};

const stamp = (iso: string) => {
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${t}`;
};

interface FeedItem {
  at: string;
  text: string;
  thought?: string;
  ms?: number;
  muted?: boolean;
  live?: boolean;
}

function buildFeed(entries: DiaryEntry[], mind: MindStep[], sleeping: boolean): FeedItem[] {
  const feed: FeedItem[] = entries.map(e =>
    e.kind === 'thought'
      ? { at: e.at, text: 'Thought', thought: e.text }
      : { at: e.at, text: e.text, thought: e.thought, ms: e.ms, muted: e.kind !== 'action' && e.kind !== 'decision' },
  );
  const now = mind[mind.length - 1];
  const last = entries[entries.length - 1];
  if (now && !sleeping && now.kind !== 'decision' && (!last || now.at > last.at)) {
    feed.push({ at: now.at, text: now.step, muted: true, live: true });
  }
  return feed;
}

export function DiaryDialog({ entries, mind }: { entries: DiaryEntry[]; mind: MindStep[] }) {
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView();
  }, [open, entries.length, mind.length]);

  const now = mind[mind.length - 1];
  const sleeping = now ? now.state === 'sleeping' : entries[entries.length - 1]?.kind === 'sleep';
  const recent = entries.slice(-3).reverse();
  const feed = buildFeed(entries, mind, sleeping);

  return (
    <>
      <section
        aria-label={`${GROOT.name} diary`}
        className="flex w-full flex-col gap-2.5 rounded-2xl border border-[#E8DFB8] bg-[#FFFBEA] p-3.5 font-inter text-[#3B3320] shadow-[0_2px_8px_rgba(138,123,79,0.15)]"
      >
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold">Diary</p>
          <span
            className={clsx('flex items-center gap-1 text-[10px]', sleeping ? 'text-[#8E989C]' : 'text-[#3F8F4E]')}
            title={sleeping ? 'Sleeping' : 'Awake'}
          >
            {sleeping ? 'sleeping' : 'awake'}
            <RefreshIcon spinning={!sleeping} />
          </span>
        </div>

        {now && !sleeping && (
          <p className="truncate rounded-lg bg-[#3F8F4E]/10 px-2 py-1 text-[11px] text-[#2F6E3B]" aria-live="polite">
            {now.step}…
          </p>
        )}

        {recent.length > 0 ? (
          <ul className="space-y-1.5">
            {recent.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-2 text-[11px] leading-snug">
                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: KIND_DOT[e.kind] ?? '#8E989C' }} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2">{e.thought ?? e.text}</span>
                  <span className="text-[10px] text-[#8A7B4F]">
                    {KIND_LABEL[e.kind] ?? e.kind} · {ago(e.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[#8A7B4F]">Nothing written yet.</p>
        )}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start rounded-full bg-[#3B3320] px-3 py-1 text-[11px] font-medium text-[#FFFBEA] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3F8F4E]"
        >
          Thoughts and full history
        </button>
      </section>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label={`${GROOT.name} thoughts and full history`}
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-[#FFFBEA] font-inter text-[#3B3320] shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E8DFB8] px-4 py-3">
              <p className="flex items-center gap-2 font-semibold">
                Thoughts and full history
                <RefreshIcon spinning={!sleeping} />
              </p>
              <button onClick={() => setOpen(false)} className="text-sm text-[#6B5E3A] hover:text-[#3B3320]">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
              {feed.length === 0 ? (
                <p className="text-[12px] text-[#6B5E3A]">Waiting for {GROOT.name} to stir…</p>
              ) : (
                <ol className="space-y-2 border-l-2 border-[#3F8F4E]/30 pl-3">
                  {feed.map((f, i) => {
                    const live = i === feed.length - 1 && f.live;
                    return (
                      <li key={`${f.at}-${i}`} className="text-[12px]">
                        <p className={clsx('flex items-baseline gap-2', live && 'font-medium text-[#2F6E3B]', f.muted && !live && 'text-[#6B5E3A]')}>
                          <span className="shrink-0 tabular-nums text-[10px] font-normal text-[#8A7B4F]">{stamp(f.at)}</span>
                          <span className="min-w-0">
                            {f.text}
                            {live && '…'}
                            {f.ms !== undefined && <span className="font-normal text-[#8A7B4F]"> · {(f.ms / 1000).toFixed(1)}s on 0G</span>}
                          </span>
                        </p>
                        {f.thought && <Thought text={f.thought} />}
                      </li>
                    );
                  })}
                </ol>
              )}
              <div ref={endRef} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Thought({ text }: { text: string }) {
  const [full, setFull] = useState(false);
  const clean = text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  return (
    <button
      type="button"
      onClick={() => setFull(f => !f)}
      title={full ? 'Show less' : 'Show more'}
      className={clsx('mt-0.5 block pl-[4.25rem] text-left text-[12px] italic leading-snug text-[#6B5E3A] hover:text-[#3B3320]', !full && 'line-clamp-2')}
    >
      &ldquo;{clean}&rdquo;
    </button>
  );
}

const RefreshIcon = ({ spinning }: { spinning: boolean }) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.25"
    aria-hidden="true"
    className={clsx(spinning && 'animate-spin motion-reduce:animate-none')}
  >
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
