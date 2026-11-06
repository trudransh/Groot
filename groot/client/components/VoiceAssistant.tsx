import { AgentAudioVisualizerRadial } from '@/components/AgentAudioVisualizerRadial';
import { DiaryDialog, type DiaryEntry } from '@/components/DiaryDialog';
import { MicDialogState, MicPermissionDialog, micPermission } from '@/components/MicPermissionDialog';
import { NoAgentNotification } from '@/components/NoAgentNotification';
import { CardStack, ForestCard, Sidebar, MemoryCard, SelfieCard, ToolsCard, WalletCard, type PlantStatus, type Selfie } from '@/components/ObjectivesCard';
import TranscriptionView from '@/components/TranscriptionView';
import { MicIcon } from '@/components/icons/MicIcon';
import { PhoneDownIcon } from '@/components/icons/PhoneDownIcon';
import { HomeAgent, firstName } from '@/config/agents.config';
import { personaConfig } from '@/config/persona.config';
import useCombinedTranscriptions, { type Transcription } from '@/hooks/useCombinedTranscriptions';
import useFaceWatch, { type FaceStatus } from '@/hooks/useFaceWatch';
import useLocalMicTrack from '@/hooks/useLocalMicTrack';
import { AgentMoodI } from '@/types/agent';
import {
  type AgentState,
  RoomAudioRenderer,
  StartMediaButton,
  type TrackReferenceOrPlaceholder,
  useIsSpeaking,
  useRoomContext,
  useTrackToggle,
  useVoiceAssistant,
} from '@livekit/components-react';
import clsx from 'clsx';
import { Track } from 'livekit-client';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';

// How long someone must look at the camera to wake Groot, and how long the frame must be empty to put it back to rest.
const LOOK_MS = 1500;
const LISTEN_GRACE_MS = 2000;
const LOST_MS = 10000;
// After Groot goes back to rest, wait this long before a look can wake it again.
const REARM_MS = 3000;

export function VoiceAssistant({
  agent,
  mood,
  ended,
  onRestart,
}: {
  agent: HomeAgent;
  mood: AgentMoodI;
  ended?: boolean;
  onRestart: () => void;
}) {
  const { state: agentState, audioTrack: agentAudioTrack } = useVoiceAssistant();

  const room = useRoomContext();

  const moodConfig = personaConfig.moods.english;
  const accent = moodConfig.visualizerBgColor;
  const name = firstName(agent);
  const withName = (label: string) => label.replace('{name}', name);

  // Groot rests until the camera sees someone looking at it; the agent reports each change.
  const [dormant, setDormant] = useState(true);
  useEffect(() => {
    room.registerTextStreamHandler('groot_state', async reader => {
      setDormant((await reader.readAll()).trim() === 'dormant');
    });
    return () => room.unregisterTextStreamHandler('groot_state');
  }, [room]);

  const [plantStatus, setPlantStatus] = useState<PlantStatus | null>(null);
  useEffect(() => {
    room.registerTextStreamHandler('groot_status', async reader => {
      try {
        setPlantStatus(JSON.parse(await reader.readAll()));
      } catch (err) {
        console.error('Bad plant status', err);
      }
    });
    return () => room.unregisterTextStreamHandler('groot_status');
  }, [room]);

  const [selfie, setSelfie] = useState<Selfie | null>(null);
  useEffect(() => {
    room.registerTextStreamHandler('groot_selfie', async reader => {
      try {
        setSelfie(JSON.parse(await reader.readAll()));
      } catch (err) {
        console.error('Bad selfie', err);
      }
    });
    return () => room.unregisterTextStreamHandler('groot_selfie');
  }, [room]);

  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  useEffect(() => {
    room.registerTextStreamHandler('groot_diary', async reader => {
      try {
        setDiary(JSON.parse(await reader.readAll()));
      } catch (err) {
        console.error('Bad diary', err);
      }
    });
    return () => room.unregisterTextStreamHandler('groot_diary');
  }, [room]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const dormantRef = useRef(dormant);
  dormantRef.current = dormant;
  const sendPresence = (event: 'seen' | 'lost') =>
    room.localParticipant.sendText(event, { topic: 'presence' }).catch(err => console.error(err));
  const face = useFaceWatch(videoRef, {
    lookMs: LOOK_MS,
    lostMs: LOST_MS,
    armed: dormant,
    rearmDelayMs: REARM_MS,
    onSeen: () => sendPresence('seen'),
    onLost: () => sendPresence('lost'),
  });

  // Crowd filter: the mic only carries sound while someone is looking at Groot (with a short grace for glances away).
  const [faceGate, setFaceGate] = useState(false);
  useEffect(() => {
    if (face.status === 'looking') {
      setFaceGate(true);
      return;
    }
    const t = setTimeout(() => setFaceGate(false), LISTEN_GRACE_MS);
    return () => clearTimeout(t);
  }, [face.status]);
  useEffect(() => {
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
    if (track) track.enabled = faceGate;
  });

  // The agent's look_at_myself tool calls this to see the plant through the back camera.
  const captureRef = useRef(face.capturePlant);
  captureRef.current = face.capturePlant;
  useEffect(() => {
    room.localParticipant.registerRpcMethod('take_plant_photo', () => captureRef.current());
    return () => room.localParticipant.unregisterRpcMethod('take_plant_photo');
  }, [room]);

  // Typed messages; the agent never sends these back as transcriptions.
  const [localMessages, setLocalMessages] = useState<Transcription[]>([]);
  const [draft, setDraft] = useState('');

  // When muted the agent replies in text only and makes no TTS calls.
  const [agentMuted, setAgentMuted] = useState(false);

  const micTrackRef = useLocalMicTrack();
  const userSpeaking = useIsSpeaking(micTrackRef.participant);
  const {
    enabled: micEnabled,
    pending: micPending,
    toggle: toggleMic,
  } = useTrackToggle({
    source: Track.Source.Microphone,
  });

  // The room opens with the mic off, so text chat works without one. Unmuting
  // asks for the mic first unless access is already granted; a blocked or
  // missing mic shows in the dialog, and the user can keep typing.
  const [micDialog, setMicDialog] = useState<MicDialogState | null>(null);

  const enableMic = async () => {
    try {
      await room.localParticipant.setMicrophoneEnabled(true, { noiseSuppression: true, echoCancellation: true, autoGainControl: false, voiceIsolation: true });
    } catch (err) {
      console.error('Could not turn on the microphone', err);
      setMicDialog(err instanceof Error && err.name === 'NotFoundError' ? 'missing' : 'blocked');
    }
  };

  const handleMicClick = async () => {
    if (micEnabled) return toggleMic(false);
    const permission = await micPermission();
    if (permission === 'granted') enableMic();
    else setMicDialog(permission === 'denied' ? 'blocked' : 'ask');
  };

  const combinedTranscriptions = useCombinedTranscriptions(localMessages);

  // The room listens for speech from the start; the agent ignores it while dormant.
  useEffect(() => {
    if (!micEnabled) enableMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (dormant) restRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [dormant]);

  // Ends this conversation only: Groot goes back to rest and the room stays open.
  const handleEndConversation = async () => {
    await room.localParticipant.sendText('end', { topic: 'user_end_conversation' });
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const now = Date.now();
    setLocalMessages(prev => [
      ...prev,
      { id: `local-${now}`, text, role: 'user', firstReceivedTime: now, local: true },
    ]);
    await room.localParticipant.sendText(text, { topic: 'lk.chat' });
  };

  const handleToggleMute = async () => {
    const next = !agentMuted;
    setAgentMuted(next);
    await room.localParticipant.sendText(String(next), { topic: 'agent_audio_muted' });
  };

  const inSession = !ended;

  return (
    // Header, scrolling messages and input stack as three rows, so the input
    // never covers the messages and the messages get all the spare height.
    <div className="fixed inset-0 flex bg-[#F5F5F5]">
      <div className="relative flex min-w-0 flex-1 flex-col">
      {/* Leaves at once: no goodbye, no end card. */}
      <button
        type="button"
        onClick={onRestart}
        aria-label={moodConfig.backLabel}
        title={moodConfig.backLabel}
        className="absolute left-4 top-8 z-10 h-11 w-11 rounded-full bg-white text-[#273339] flex items-center justify-center shadow-md transition-colors hover:bg-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3F8F4E]"
      >
        <BackIcon />
      </button>
      <div
        className="absolute inset-0 pointer-events-none -z-10"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
        aria-hidden="true"
      ></div>


      <div className="min-h-0 flex-1">
        <TranscriptionView
          mood={mood}
          combinedTranscriptions={combinedTranscriptions}
          thinking={inSession && agentState === 'thinking'}
          footer={
            (dormant || ended) && (
              <p ref={restRef} className="py-6 text-center font-inter text-lg text-[#3F8F4E]">
                I&apos;m here.
              </p>
            )
          }
        />
      </div>


      <RoomAudioRenderer muted={agentMuted} />
      {micDialog && (
        <MicPermissionDialog
          mood={mood}
          agentName={name}
          initialState={micDialog}
          onClose={() => setMicDialog(null)}
          onGranted={() => {
            setMicDialog(null);
            enableMic();
          }}
        />
      )}
      <NoAgentNotification state={agentState} />

      <footer className={clsx('shrink-0 px-4', !ended && 'pb-5 pt-2')}>
        {!ended && (
          <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-3">
            <StartMediaButton />
            <form onSubmit={handleSend} className="flex w-full items-center gap-2">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={moodConfig.inputPlaceholder}
                aria-label={moodConfig.inputPlaceholder}
                disabled={!inSession}
                className="h-12 min-w-0 flex-1 rounded-full border border-[#E4EAEB] bg-white px-5 text-[#171D21] font-inter shadow-sm outline-none focus:border-[#3F8F4E] focus:ring-2 focus:ring-[#3F8F4E]/30 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!draft.trim() || !inSession}
                aria-label={moodConfig.sendLabel}
                title={moodConfig.sendLabel}
                className="h-12 w-12 shrink-0 rounded-full text-white flex items-center justify-center shadow-sm transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3F8F4E]"
                style={{ backgroundColor: accent }}
              >
                <SendIcon />
              </button>
            </form>

            {/* Call controls. The rings are LiveKit's radial visualizer: they follow
                the voice level, and for Groot also show listening and thinking. */}
            <div className="flex items-center justify-center gap-8 pt-1">
              <RingButton
                label={micEnabled ? moodConfig.micMuteLabel : moodConfig.micUnmuteLabel}
                pressed={!micEnabled}
                onClick={handleMicClick}
                disabled={micPending || !inSession}
                state={ringState(!micEnabled, userSpeaking ? 'speaking' : 'listening')}
                audioTrack={micTrackRef}
                color={accent}
              >
                {micEnabled ? <MicIcon color="#273339" /> : <MicOffIcon />}
              </RingButton>
              <button
                type="button"
                onClick={handleEndConversation}
                disabled={dormant}
                aria-label={moodConfig.endCallLabel}
                title={moodConfig.endCallLabel}
                className="h-14 w-14 shrink-0 rounded-full bg-[#F06444] hover:bg-[#DC2626] text-white flex items-center justify-center shadow-md transition-colors disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#DC2626]"
              >
                <PhoneDownIcon />
              </button>
              <RingButton
                label={withName(agentMuted ? moodConfig.unmuteLabel : moodConfig.muteLabel)}
                pressed={agentMuted}
                onClick={handleToggleMute}
                disabled={!inSession}
                state={ringState(agentMuted, agentState)}
                audioTrack={agentAudioTrack}
                color={accent}
              >
                <SpeakerIcon muted={agentMuted} />
              </RingButton>
            </div>
          </div>
        )}
      </footer>
      </div>
      <Sidebar>
        <CardStack tabs={['Camera', 'Selfie', 'Tools', 'Memory', 'Diary']}>
          <CameraPreview videoRef={videoRef} status={face.status} error={face.error} dormant={dormant} facing={face.facing} />
          <SelfieCard selfie={selfie} />
          <ToolsCard tools={plantStatus?.tools ?? []} />
          <MemoryCard status={plantStatus} />
          <DiaryDialog entries={diary} />
        </CardStack>
        <CardStack tabs={['Wallet', 'Forest']}>
          <WalletCard />
          <ForestCard />
        </CardStack>
      </Sidebar>
    </div>
  );
}

const FACE_COLORS: Record<FaceStatus, string> = { none: '#8E989C', present: '#E0B64A', looking: '#3F8F4E' };

/** Small mirrored camera square; its border shows what the face watcher sees. */
function CameraPreview({
  videoRef,
  status,
  error,
  dormant,
  facing,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: FaceStatus;
  error: string | null;
  dormant: boolean;
  facing: 'user' | 'environment';
}) {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl bg-[#171D21] shadow-sm"
      title={error ?? (dormant ? 'Resting: look at the camera to wake Groot' : 'Awake')}
    >
      <video ref={videoRef} muted playsInline className={clsx('h-full w-full object-cover', facing === 'user' && '-scale-x-100')} />
      {error && <p className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] text-white">{error}</p>}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 font-inter text-[11px] text-white">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: FACE_COLORS[status] }} />
        {facing === 'environment' ? 'looking at me' : dormant ? 'resting' : 'awake'}
      </span>
    </div>
  );
}

/**
 * Both rings share one look: faint and still at rest, lit and following the
 * voice while speaking, spinning while Groot thinks. The visualizer shows
 * 'disconnected' as a faint ring, so rest and mute map to it.
 */
function ringState(muted: boolean, state: AgentState): AgentState {
  if (muted) return 'disconnected';
  return state === 'speaking' || state === 'thinking' ? state : 'disconnected';
}

/** A round toggle with a radial voice visualizer around it. */
function RingButton({
  label,
  pressed,
  onClick,
  disabled,
  state,
  audioTrack,
  color,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  state: AgentState;
  audioTrack?: TrackReferenceOrPlaceholder;
  color: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
      <AgentAudioVisualizerRadial
        className="absolute inset-0"
        radius={34}
        barCount={24}
        state={state}
        audioTrack={audioTrack}
        color={pressed ? '#8E989C' : color}
      />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={pressed}
        aria-label={label}
        title={label}
        className="relative h-14 w-14 rounded-full bg-white text-[#273339] flex items-center justify-center shadow-md transition-colors hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#3F8F4E]"
      >
        {children}
      </button>
    </div>
  );
}

const SpeakerIcon = ({ muted }: { muted: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M11 5 6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
    {muted ? (
      <path d="m23 9-6 6M17 9l6 6" strokeLinecap="round" />
    ) : (
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" strokeLinecap="round" />
    )}
  </svg>
);

const MicOffIcon = () => (
  <svg width="20" height="22" viewBox="0 0 24 24" fill="none" stroke="#8E989C" strokeWidth="2" aria-hidden="true">
    <path
      d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.8M19 11v1a7 7 0 0 1-1.1 3.8M5 11v1a7 7 0 0 0 11.6 5.3M12 19v3M8 22h8M3 3l18 18"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SendIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.25"
    aria-hidden="true"
  >
    <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
