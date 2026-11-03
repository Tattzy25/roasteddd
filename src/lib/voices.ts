import { sessionPersona } from "./sessionData";

export const VOICES = {
  cinder: "Fenrir",
  "zero-day": "Charon",
  vesper: "Aoede",
} as const;

export type RoastPersona = keyof typeof VOICES;

export const selectedVoice = VOICES[sessionPersona as RoastPersona];
