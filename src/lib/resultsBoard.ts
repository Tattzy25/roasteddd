// lib/resultsBoard.ts
import { roastId } from "./sessionData";

const sessionBaseId = roastId || crypto.randomUUID();

function randomSixLetters(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

export function sendToResultsBoard(
  speaker: "THE_HUMAN" | "THE_AI",
  transcript: string,
  answers: {
    team: {
      type: "choice";
      choice: "THE_HUMAN" | "THE_AI";
      probabilities: Record<"THE_HUMAN" | "THE_AI", number>;
    };
    brutality: {
      type: "score";
      score: number;
      probabilities: Record<string, number> | number[];
      confidence?: number | null;
    };
  },
) {
  const payload = {
    roast_id: sessionBaseId,
    roast_event: `${sessionBaseId}_${randomSixLetters()}`,
    speaker,
    transcript,
    answers,
  };

  window.parent.postMessage(payload, "*");
}