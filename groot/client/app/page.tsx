'use client';

import { Button } from '@/components/Button';
import { ChatRoom } from '@/components/ChatRoom';
import { GROOT } from '@/config/agents.config';
import { personaConfig } from '@/config/persona.config';
import { useTalkSession } from '@/hooks/useTalkSession';
import { AgentMoodEnum } from '@/types/agent';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { nyghtMedium } from './fonts/fonts';

const mood = AgentMoodEnum.ENGLISH;

export default function HomePage() {
  const { room, status, error, start, reset } = useTalkSession();
  const starting = status === 'connecting';
  const moodConfig = personaConfig.moods[mood];

  if (room && (status === 'connected' || status === 'ended')) {
    return <ChatRoom room={room} agent={GROOT} mood={mood} ended={status === 'ended'} onRestart={reset} />;
  }

  return (
    <main className="min-h-dvh grid grid-rows-[1fr_auto] bg-[#F5F5F5] relative overflow-x-clip">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      />

      <div className="z-10 flex flex-col items-center text-center justify-center px-6 py-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              'text-[#3F8F4E] leading-[0.9] tracking-[0.04em] text-6xl md:text-[clamp(4.5rem,11dvh,7rem)]',
              nyghtMedium.className
            )}
          >
            {GROOT.name}
          </motion.h1>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-5 md:mt-6 w-16 h-px bg-[#3F8F4E]/40"
          />

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-4 md:mt-5 text-xs md:text-sm text-[#8E989C] font-inter font-medium tracking-[0.25em] uppercase"
          >
            {GROOT.subtitle}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-[clamp(1.25rem,4dvh,2.5rem)] flex flex-col items-center gap-4"
        >
          <Button
            onClick={start}
            disabled={starting}
            aria-busy={starting}
            className={clsx('inline-flex items-center justify-center gap-3', starting && 'cursor-wait opacity-90')}
          >
            {starting && <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {starting ? moodConfig.startingLabel : GROOT.startLabel}
          </Button>
          <p role="alert" className="absolute inset-x-0 top-full mt-3 text-sm font-inter text-[#DC2626]">
            {error}
          </p>
        </motion.div>
      </div>

      <div className="z-10 w-full text-center text-[#5C686D] text-xs md:text-sm font-inter py-5">
        {personaConfig.tagline}
      </div>
    </main>
  );
}
