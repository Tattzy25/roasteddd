// api/judge.ts
export default async function handler(req: any, res: any) {
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const authToken = process.env.CLOUDFLARE_AUTH_TOKEN;

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/cloudflare/clef-omni`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        "cf-aig-gateway-id": "default"
      },
      body: JSON.stringify({
        model: "clef-omni",
        state: body.state,
        questions: body.questions,
      }),
    },
  );

  const data = await response.json();
  return res.status(response.status).json(data);
}