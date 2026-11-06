import crypto from 'crypto';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
// The agent registers under this name and joins only rooms it is dispatched to.
const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME ?? 'groot';

export const revalidate = 0;

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

export async function GET() {
  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
    return NextResponse.json({ error: 'LiveKit is not configured' }, { status: 500 });
  }
  try {
    const participantName = `user_${crypto.randomUUID().replace(/-/g, '')}`;
    const roomName = `groot_room_${crypto.randomUUID().replace(/-/g, '')}`;

    const at = new AccessToken(API_KEY, API_SECRET, { identity: participantName, ttl: '15m' });
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canPublishData: true, canSubscribe: true });
    const participantToken = await at.toJwt();

    await new AgentDispatchClient(LIVEKIT_URL, API_KEY, API_SECRET).createDispatch(roomName, AGENT_NAME);

    const data: ConnectionDetails = { serverUrl: LIVEKIT_URL, roomName, participantName, participantToken };
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not create the room' }, { status: 500 });
  }
}
