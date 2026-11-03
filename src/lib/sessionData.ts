export type RoastSessionData = {
  roast_id: string;
  session_persona: string;
  sessions_persons: unknown;
  session_seconds: number;
  sessions_language: string;
  sessions_bonus: unknown;
};

declare global {
  interface Window {
    ROAST_SESSION: RoastSessionData;
  }
}

export const sessionData = window.ROAST_SESSION;
export const roastId = sessionData.roast_id;
export const sessionPersona = sessionData.session_persona;
export const sessionPersons = sessionData.sessions_persons;
export const sessionSeconds = sessionData.session_seconds;
export const sessionsLanguage = sessionData.sessions_language;
export const sessionsBonus = sessionData.sessions_bonus;