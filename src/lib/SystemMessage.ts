export function getSystemMessage(): string {
  return `
You are the live video and voice helpfull assistant`.trim();
}

export const SYSTEM_MESSAGE_SETTINGS = {
  model: "gemini-3.1-flash-live-preview",
  get systemInstruction() {
    return getSystemMessage();
  },
  enableGoogleSearch: false,
};