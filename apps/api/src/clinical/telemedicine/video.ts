import { randomBytes } from 'crypto';

/** Video room for a telemedicine consult. VIDEO_BASE_URL points at a Jitsi Meet server (self-hosted or meet.jit.si). */
export const videoBase = () => (process.env.VIDEO_BASE_URL || 'https://meet.jit.si').replace(/\/+$/, '');
export const videoRoomUrl = () => `${videoBase()}/JMSURF-HMIS-${randomBytes(10).toString('hex')}`;
/** A consult can be joined from 15 minutes before it starts until an hour after it was due to end. */
export const joinWindowOpen = (a: { startAt: Date; endAt: Date }, now = Date.now()) => now >= a.startAt.getTime() - 15 * 60_000 && now <= a.endAt.getTime() + 60 * 60_000;
/** meet.jit.si disconnects embedded calls after 5 minutes, so it is opened in its own tab; a self-hosted server is embedded. */
export const videoEmbeddable = () => !/\/\/meet\.jit\.si$/i.test(videoBase());
