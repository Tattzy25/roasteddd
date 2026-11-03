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

export const sessionData: RoastSessionData = window.ROAST_SESSION || {
  roast_id: "",
  session_persona: "cinder",
  sessions_persons: 1,
  session_seconds: 0,
  sessions_language: "English",
  sessions_bonus: 0,
};

export let roastId = sessionData.roast_id;
export let sessionPersona = sessionData.session_persona;
export let sessionPersons = sessionData.sessions_persons;
export let sessionSeconds = Number(sessionData.session_seconds) || 0;
export let sessionsLanguage = sessionData.sessions_language;
export let sessionsBonus = sessionData.sessions_bonus;

window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data?.payload ?? event.data?.config ?? event.data?.session ?? event.data;
  if (!data || typeof data !== "object" || !("session_seconds" in data)) return;

  Object.assign(sessionData, data);
  roastId = sessionData.roast_id;
  sessionPersona = sessionData.session_persona;
  sessionPersons = sessionData.sessions_persons;
  sessionSeconds = parseFloat(String(sessionData.session_seconds)) || 0;
  sessionsLanguage = sessionData.sessions_language;
  sessionsBonus = sessionData.sessions_bonus;
});

window.parent.postMessage({ type: "ROASTTID_SESSION_CONFIG_REQUEST" }, "*");