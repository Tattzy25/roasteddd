// api/judge.ts
export default async function handler(req: any, res: any) {
  const { speaker, transcript } = req.body;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const authToken = process.env.CLOUDFLARE_AUTH_TOKEN;

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/cloudflare/clef-omni`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "clef-omni",
        state: `${speaker} ${transcript}`,
        questions: {
          team: {
            type: "choice",
            instructions: "Which team was the score for?",
            criteria: {
              THE_HUMAN: "The roast was spoken by THE_HUMAN",
              THE_AI: "The roast was spoken by THE_AI",
            },
          },
          brutality: {
            type: "score",
            instructions:
              "Score the brutality, wit, and impact of this roast chunk using the 0 to 5 scale below. This chunk is from a live roast battle where the AI has live camera vision of the human (their face, room, and real-time reactions), while the human is looking at a floating digital orb representing the AI. Factor in the asymmetry: the AI has a full visual target to pick apart, while the human only has a floating orb and the AI's voice/personality to attack. Hold the AI to a high standard so lazy visual observations score low, and reward the human when they find creative ways to violate a floating orb and its attitude.",
            criteria: [
              "0- Trash Tier: Weak, stumbling, or completely generic attempt; either the AI made a lazy, obvious visual callout with no punchline, or the human threw a weak insult.",
              "1- Mild Burn: A basic surface-level jab that lands lightly, but lacks real venom, cleverness, or devastating timing.",
              "2- Solid Cook: A clean, sharp hit either the AI used its camera vision to snipe a specific detail effectively, or the human flipped the orb/AI persona angle into a solid punchline.",
              "3- Violated: A ruthless, highly specific strike that exploits a real flaw, awkward reaction, or conversational opening with brutal precision.",
              "4- Smokathon Domination: Total annihilation, either the AI weaponized its live vision for a surgical, soul-crushing takedown, or the human dismantled the orb and the AI's entire existence with zero mercy.",
              "5- Extinction Event: God-tier, once-in-a-lifetime execution; a roast so diabolical, unhinged, and layered that it permanently ends the battle on the spot either the AI read the human's entire life story off a single camera frame, or the human broke the orb's logic so badly the machine practically needs a factory reset.",
            ],
          },
        },
      }),
    },
  );

  const data = await response.json();
  return res.status(response.status).json(data);
}