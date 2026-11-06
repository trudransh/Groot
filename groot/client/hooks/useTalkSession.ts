'use client';

import type { ConnectionDetails } from '@/app/api/connection-details/route';
import { Room, RoomEvent } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type TalkStatus = 'idle' | 'connecting' | 'connected' | 'ended';

const START_ERROR = "Couldn't start the session. Please try again.";

// One LiveKit room per session; the mic stays off until the user unmutes it in the room.
export function useTalkSession() {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<TalkStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setStatus('connecting');

    const newRoom = new Room();
    roomRef.current = newRoom;

    newRoom.on(RoomEvent.MediaDevicesError, err => console.error(err));
    newRoom.on(RoomEvent.Disconnected, () => {
      newRoom.removeAllListeners();
      setStatus(prev => (prev === 'idle' ? prev : 'ended'));
    });

    try {
      const response = await fetch('/api/connection-details', { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(body.error || `Connection failed (${response.status})`);
      }
      const details: ConnectionDetails = await response.json();

      // The agent sends this from end_session; the end card always follows.
      newRoom.registerTextStreamHandler('conversation_ended', async reader => {
        await reader.readAll();
        newRoom.disconnect();
      });

      await newRoom.connect(details.serverUrl, details.participantToken);
      await newRoom.startAudio().catch(() => undefined);

      setRoom(newRoom);
      setStatus('connected');
    } catch (err) {
      console.error('Error connecting to room', err);
      newRoom.removeAllListeners();
      newRoom.disconnect();
      roomRef.current = null;
      setError(START_ERROR);
      setStatus('idle');
    }
  }, []);

  const reset = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setRoom(null);
    setError(null);
    setStatus('idle');
  }, []);

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  return { room, status, error, start, reset };
}
