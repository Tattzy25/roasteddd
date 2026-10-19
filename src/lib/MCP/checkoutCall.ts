import { CHECKOUT_MCP_ENDPOINT, getShopDomain } from "../GeminiTools/config";

function parseMcpResponse(rawBody: string): unknown {
  const eventData = rawBody
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter(Boolean)
    .join("\n");

  return JSON.parse(eventData || rawBody);
}

export async function callCheckoutMcp(
  name: string,
  id: string | undefined,
  args: unknown,
) {
  const shopDomain = getShopDomain();

  const response = await fetch(CHECKOUT_MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: {
          ...(shopDomain ? { shop_domain: shopDomain } : {}),
          ...(typeof args === "object" && args !== null ? args : {}),
        },
      },
    }),
  });

  const rawBody = await response.text();

  return parseMcpResponse(rawBody);
}

export function isCheckoutTool(name: string): boolean {
  return [
    "get_checkout",
    "update_checkout",
  ].includes(name);
}