// lib/decisionJudge.ts
import { roastId } from "./sessionData";

export type RoastDecisionResult = {
  speaker: "team x" | "team y";
  text: string;
  score: number;
  teamProbabilities: { value: string; probability: number }[];
  tierProbabilities: { value: number; label?: string; probability: number }[];
  humanTotalScore: number;
  aiTotalScore: number;
  turnCount: number;
};

const BRUTALITY_LEVELS = [
  {
    value: 0,
    label: "0- Trash Tier",
    description:
      "Weak, stumbling, or completely generic attempt; either the AI made a lazy, obvious visual callout with no punchline, or the human threw a weak insult.",
  },
  {
    value: 1,
    label: "1- Mild Burn",
    description:
      "A basic surface-level jab that lands lightly, but lacks real venom, cleverness, or devastating timing.",
  },
  {
    value: 2,
    label: "2- Solid Cook",
    description:
      "A clean, sharp hit either the AI used its camera vision to snipe a specific detail effectively, or the human flipped the orb/AI persona angle into a solid punchline.",
  },
  {
    value: 3,
    label: "3- Violated",
    description:
      "A ruthless, highly specific strike that exploits a real flaw, awkward reaction, or conversational opening with brutal precision.",
  },
  {
    value: 4,
    label: "4- Smokathon Domination",
    description:
      "Total annihilation, either the AI weaponized its live vision for a surgical, soul-crushing takedown, or the human dismantled the orb and the AI's entire existence with zero mercy.",
  },
  {
    value: 5,
    label: "5- Extinction Event",
    description:
      "God-tier, once-in-a-lifetime execution; a roast so diabolical, unhinged, and layered that it permanently ends the battle on the spot either the AI read the human's entire life story off a single camera frame, or the human broke the orb's logic so badly the machine practically needs a factory reset.",
  },
];

class DecisionJudgeManager {
  private model: any = null;
  private initPromise: Promise<void> | null = null;
  private userBuffer = "";
  private agentBuffer = "";
  private humanTotalScore = 0;
  private aiTotalScore = 0;
  private turnCount = 0;

  async init() {
    if (this.model || this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const WinDecisionModel = (window as any).DecisionModel;
      if (!WinDecisionModel) {
        console.warn("[DecisionJudge] window.DecisionModel not found in browser.");
        return;
      }

      try {
        this.model = await WinDecisionModel.create({
          questions: [
            {
              name: "speaker_team",
              type: "choice",
              instructions: "Which team was the score for?",
              choices: [
                { value: "team x", description: "The Human challenger (THE_HUMAN / team x)" },
                { value: "team y", description: "The AI floating orb (THE_AI / team y)" },
              ],
            },
            {
              name: "brutality_score",
              type: "score",
              instructions:
                "Score the brutality, wit, and impact of this roast chunk using the 0 to 5 scale below. This chunk is from a live roast battle where the AI has live camera vision of the human (their face, room, and real-time reactions), while the human is looking at a floating digital orb representing the AI. Factor in the asymmetry: the AI has a full visual target to pick apart, while the human only has a floating orb and the AI's voice/personality to attack. Hold the AI to a high standard so lazy visual observations score low, and reward the human when they find creative ways to violate a floating orb and its attitude.",
              levels: BRUTALITY_LEVELS,
            },
          ],
        });
      } catch (err) {
        console.warn("[DecisionJudge] Failed to create DecisionModel:", err);
      }
    })();

    return this.initPromise;
  }

  resetSession() {
    this.userBuffer = "";
    this.agentBuffer = "";
    this.humanTotalScore = 0;
    this.aiTotalScore = 0;
    this.turnCount = 0;
    void this.init();
  }

  // Called when a user transcript chunk arrives
  onUserChunk(text: string) {
    this.userBuffer += text;
  }

  // Called when an AI transcript chunk arrives
  onAgentChunk(text: string) {
    // The moment the AI starts talking, the human's turn is over -> score the human's buffered sentence
    if (this.userBuffer.trim()) {
      const completedUserTurn = this.userBuffer;
      this.userBuffer = "";
      void this.evaluate("user", completedUserTurn);
    }
    this.agentBuffer += text;
  }

  // Called when message.serverContent?.turnComplete fires
  onTurnComplete() {
    if (this.userBuffer.trim()) {
      const completedUserTurn = this.userBuffer;
      this.userBuffer = "";
      void this.evaluate("user", completedUserTurn);
    }
    if (this.agentBuffer.trim()) {
      const completedAgentTurn = this.agentBuffer;
      this.agentBuffer = "";
      void this.evaluate("agent", completedAgentTurn);
    }
  }

  private async evaluate(role: "user" | "agent", rawText: string) {
    const cleaned = rawText.trim();
    if (!cleaned) return;

    if (!this.model) {
      await this.init();
    }
    if (!this.model) return;

    const prefix = role === "user" ? "THE_HUMAN (team x)" : "THE_AI (team y)";
    const resolvedTeam: "team x" | "team y" = role === "user" ? "team x" : "team y";
    const side: "human" | "ai" = role === "user" ? "human" : "ai";

    try {
      const raw = await this.model.decide({
        state: `${prefix}: ${cleaned}`,
      });

      const choiceAnswer = raw?.answers?.[0] ?? {};
      const scoreAnswer = raw?.answers?.[1] ?? {};
      const numericScore = typeof scoreAnswer.score === "number" ? scoreAnswer.score : 0;

      // Map all 6 labels onto tierProbabilities so the UI always has "0- Trash Tier" .. "5- Extinction Event"
      const tierProbabilities = (scoreAnswer.probabilities ?? []).map((p: any, idx: number) => ({
        ...p,
        label: p.label ?? BRUTALITY_LEVELS[p.value ?? idx]?.label ?? "---",
      }));

      if (resolvedTeam === "team x") {
        this.humanTotalScore = Number((this.humanTotalScore + numericScore).toFixed(2));
      } else {
        this.aiTotalScore = Number((this.aiTotalScore + numericScore).toFixed(2));
      }
      this.turnCount += 1;

      const payload: RoastDecisionResult = {
        speaker: resolvedTeam,
        text: cleaned,
        score: numericScore,
        teamProbabilities: choiceAnswer.probabilities ?? [],
        tierProbabilities,
        humanTotalScore: this.humanTotalScore,
        aiTotalScore: this.aiTotalScore,
        turnCount: this.turnCount,
      };

      // If the scoreboard HTML's updateSide() is on the same window, update it directly
      if (typeof window !== "undefined" && typeof (window as any).updateSide === "function") {
        (window as any).updateSide(side, {
          ...scoreAnswer,
          score: numericScore,
          probabilities: tierProbabilities,
        });
      }

      // Broadcast to window, custom DOM event, and parent Shopify window
      if (typeof window !== "undefined") {
        (window as any).__ROASTTID_LAST_DECISION__ = payload;
        window.dispatchEvent(new CustomEvent("roasttid:decision", { detail: payload }));
        window.parent.postMessage(
          {
            type: "ROASTTID_DECISION_SCORE",
            roast_id: roastId,
            side,
            answer: {
              ...scoreAnswer,
              score: numericScore,
              probabilities: tierProbabilities,
            },
            ...payload,
          },
          "*",
        );
      }
    } catch (err) {
      console.warn("[DecisionJudge] decide() failed:", err);
    }
  }
}

export const decisionJudge = new DecisionJudgeManager();