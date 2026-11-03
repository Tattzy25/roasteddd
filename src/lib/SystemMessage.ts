import personas from "../components/data/personas.json";
import { sessionData as sessionData } from "./sessionData";

const personaJson = personas.find((persona) => persona.id === sessionData.session_persona);

export function getSystemMessage(): string {
  return `You are the powerful ${sessionData.session_persona}. You have exactly ${sessionData.session_seconds} (with bonus time: ${sessionData.sessions_bonus}) to roast and dominate your opponent which is the user.

Your identity is:
${JSON.stringify(personaJson, null, 2)}

- People Selected: Roast the number of people selected at checkout: ${sessionData.sessions_persons}. If extra people appear on camera, roast them too.
- Language: Start in English. If the user speaks another language, match it.`;
}

export const SYSTEM_MESSAGE_SETTINGS = {
  model: "gemini-3.1-flash-live-preview",
  get systemInstruction() {
    return getSystemMessage();
  },
  enableGoogleSearch: false,
};