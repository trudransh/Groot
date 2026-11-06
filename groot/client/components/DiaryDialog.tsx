'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, ago } from '@/components/ObjectivesCard';
import { GROOT } from '@/config/agents.config';

// Mirrors diary.write() in agent/voice_agent/diary.py.
export interface DiaryEntry {
  at: string;
  kind: 'thought' | 'action' | 'sleep' | 'wake' | 'conversation';
  text: string;
}

const KIND_LABEL: Record<DiaryEntry['kind'], string> = {
  wake: 'woke',
  thought: 'thought',
  action: 'did',
  sleep: 'slept',
  conversation: 'talked',
};

const time = (iso: string) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A carousel card showing the latest entry; opens the whole diary as a dialog. */
export function DiaryDialog({ entries }: { entries: DiaryEntry[] }) {
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView();
  }, [open, entries.length]);
  const last = entries[entries.length - 1];

  return (
    <>
      <Card title="Diary" onClick={() => setOpen(true)}>
        {last ? (
          <>
            <p className="text-[#8A7B4F]">{ago(last.at)}</p>
            <p className="line-clamp-4">{last.text}</p>
          </>
        ) : (
          <p className="text-[#8A7B4F]">Nothing yet</p>
        )}
      </Card>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label={`${GROOT.name} diary`}
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-[#FFFBEA] font-inter text-[#3B3320] shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E8DFB8] px-4 py-3">
              <p className="font-semibold">{GROOT.name} diary</p>
              <button onClick={() => setOpen(false)} className="text-sm text-[#6B5E3A] hover:text-[#3B3320]">
                Close
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              {entries.length === 0 && <p className="text-[#6B5E3A]">Nothing written yet.</p>}
              {entries.map((e, i) => (
                <div key={i}>
                  <p className="text-[11px] text-[#8A7B4F]">
                    {time(e.at)} · {KIND_LABEL[e.kind] ?? e.kind}
                  </p>
                  <p className="whitespace-pre-line">{e.text}</p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
