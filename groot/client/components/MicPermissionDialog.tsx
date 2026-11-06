'use client';

import { personaConfig } from '@/config/persona.config';
import { AgentMoodI } from '@/types/agent';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

export type MicDialogState = 'ask' | 'asking' | 'blocked' | 'missing';

/** 'granted' | 'prompt' | 'denied', or 'unknown' where the browser can't say. */
export async function micPermission(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state;
  } catch {
    return 'unknown';
  }
}

/**
 * Asks for the microphone when the user unmutes in a voice room. Only opened
 * when access isn't granted yet; shows a blocked or missing mic right here.
 */
export function MicPermissionDialog({
  mood,
  agentName,
  initialState,
  onGranted,
  onClose,
}: {
  mood: AgentMoodI;
  agentName: string;
  initialState: MicDialogState;
  onGranted: () => void;
  onClose: () => void;
}) {
  const text = personaConfig.moods.english.mic;
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<MicDialogState>(initialState);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const requestMic = async () => {
    setState('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      onGranted();
    } catch (err) {
      console.error('Microphone request failed', err);
      setState(err instanceof Error && err.name === 'NotFoundError' ? 'missing' : 'blocked');
    }
  };

  const failed = state === 'blocked' || state === 'missing';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="mic-dialog-title"
      className="w-[min(360px,calc(100vw-2rem))] bg-white p-6 font-inter text-left shadow-xl backdrop:bg-black/40"
    >
      <h2 id="mic-dialog-title" className="text-lg font-semibold text-[#171D21]">
        {text.title}
      </h2>
      <p
        role={failed ? 'alert' : undefined}
        className={clsx('mt-2 text-sm', failed ? 'text-[#DC2626]' : 'text-[#5C686D]')}
      >
        {state === 'blocked'
          ? text.blocked
          : state === 'missing'
            ? text.missing
            : text.body.replace('{name}', agentName)}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="h-10 px-4 text-sm font-medium text-[#5C686D] hover:text-[#171D21] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F8F4E]"
        >
          {text.cancel}
        </button>
        <button
          type="button"
          autoFocus
          onClick={requestMic}
          disabled={state === 'asking'}
          className="h-10 px-5 text-sm font-semibold text-white bg-[#3F8F4E] hover:bg-[#2E6B3A] disabled:opacity-70 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3F8F4E]"
        >
          {state === 'asking' ? text.waiting : failed ? text.retry : text.allow}
        </button>
      </div>
    </dialog>
  );
}
