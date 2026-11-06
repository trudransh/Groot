'use client';

/**
 * Radial audio visualizer, vendored from LiveKit Agents UI
 * (github.com/livekit/components-js, packages/shadcn, Apache-2.0):
 * components/agents-ui/agent-audio-visualizer-radial.tsx and
 * hooks/agents-ui/use-agent-audio-visualizer-radial.ts.
 *
 * Logic is unchanged. Upstream styles with Tailwind v4 variants this project
 * (Tailwind 3) lacks, so those rules live in globals.css under `.lk-radial`,
 * and the size variants are reduced to the radius/bar-count props.
 */
import { type AgentState, type TrackReferenceOrPlaceholder, useMultibandTrackVolume } from '@livekit/components-react';
import clsx from 'clsx';
import { type LocalAudioTrack, type RemoteAudioTrack } from 'livekit-client';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

function findGcdLessThan(columns: number, max: number = columns): number {
  function gcd(a: number, b: number): number {
    while (b !== 0) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }
  for (let i = max; i >= 1; i--) {
    if (gcd(columns, i) === i) {
      return i;
    }
  }
  return 1;
}

function generateConnectingSequenceBar(columns: number): number[][] {
  const seq = [];
  const center = Math.floor(columns / 2);

  for (let x = 0; x < columns; x++) {
    seq.push([x, (x + center) % columns]);
  }

  return seq;
}

function generateListeningSequenceBar(columns: number): number[][] {
  const divisor = columns > 8 ? columns / findGcdLessThan(columns, 4) : findGcdLessThan(columns, 2);

  return Array.from({ length: divisor }, (_, idx) => [
    ...Array(Math.floor(columns / divisor))
      .fill(1)
      .map((_, idx2) => idx2 * divisor + idx),
  ]);
}

const useAgentAudioVisualizerRadialAnimator = (
  state: AgentState | undefined,
  barCount: number,
  interval: number
): number[] => {
  const [index, setIndex] = useState(0);
  const [sequence, setSequence] = useState<number[][]>([[]]);

  useEffect(() => {
    if (state === 'thinking') {
      setSequence(generateListeningSequenceBar(barCount));
    } else if (state === 'connecting' || state === 'initializing') {
      setSequence(generateConnectingSequenceBar(barCount));
    } else if (state === 'listening') {
      setSequence(generateListeningSequenceBar(barCount));
    } else if (state === undefined || state === 'speaking') {
      setSequence([new Array(barCount).fill(0).map((_, idx) => idx)]);
    } else {
      setSequence([[]]);
    }
    setIndex(0);
  }, [state, barCount]);

  const animationFrameId = useRef<number | null>(null);
  useEffect(() => {
    let startTime = performance.now();

    const animate = (time: DOMHighResTimeStamp) => {
      const timeElapsed = time - startTime;

      if (timeElapsed >= interval) {
        setIndex(prev => prev + 1);
        startTime = time;
      }

      animationFrameId.current = requestAnimationFrame(animate);
    };

    animationFrameId.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [interval, barCount, state, sequence.length]);

  return sequence[index % sequence.length] ?? [];
};

export function AgentAudioVisualizerRadial({
  state = 'connecting',
  color,
  radius,
  barCount = 24,
  audioTrack,
  className,
  style,
}: {
  state?: AgentState;
  color?: string;
  radius: number;
  barCount?: number;
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder;
  className?: string;
  style?: CSSProperties;
}) {
  const volumeBands = useMultibandTrackVolume(audioTrack, {
    bands: barCount,
    loPass: 100,
    hiPass: 200,
  });

  const sequencerInterval = useMemo(() => {
    switch (state) {
      case 'connecting':
      case 'listening':
        return 500;
      case 'initializing':
        return 250;
      case 'thinking':
        return Infinity;
      default:
        return 1000;
    }
  }, [state]);

  const highlightedIndices = useAgentAudioVisualizerRadialAnimator(state, barCount, sequencerInterval);

  const dotSize = (radius * Math.PI) / barCount;

  return (
    <div data-lk-state={state} className={clsx('lk-radial', className)} style={{ ...style, color }} aria-hidden="true">
      {volumeBands.map((band, idx) => {
        const angle = (idx / barCount) * Math.PI * 2;

        return (
          <div
            key={`${barCount}-${idx}`}
            className="absolute top-1/2 left-1/2 h-1 w-1"
            style={{
              transformOrigin: 'center',
              // Centring is part of this transform: Tailwind 3's translate classes
              // also use `transform`, so the inline value would override them.
              transform: `translate(-50%, -50%) rotate(${angle}rad) translateY(${radius}px)`,
            }}
          >
            <div
              data-lk-index={idx}
              data-lk-highlighted={highlightedIndices.includes(idx)}
              style={{
                width: dotSize,
                minHeight: dotSize,
                height: state === 'speaking' ? `${dotSize * 10 * band}px` : 0,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
