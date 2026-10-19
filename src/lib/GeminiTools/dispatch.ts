import { callCartMcp } from "../MCP/cartCall";
import { callCatalogMcp } from "../MCP/catalogCall";
import { callFaqMcp } from "../MCP/faqCall";
import { callCheckoutMcp } from "../MCP/checkoutCall";

export type ToolCall = {
  name?: string;
  id?: string;
  args: any;
};

export const REDIRECT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "notify_cart_redirect",
        description:
          "Open the buyer's current cart on the merchant storefront in a new tab. Call this only when the buyer explicitly asks to see, edit, or review their cart.",
        parameters: {
          type: "OBJECT",
          properties: {
            url: {
              type: "STRING",
              description: "The exact cart URL returned by the merchant.",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "notify_checkout_redirect",
        description:
          "Open checkout for the buyer's current cart in a new tab. Call this only when the buyer explicitly confirms they are ready to pay.",
        parameters: {
          type: "OBJECT",
          properties: {
            url: {
              type: "STRING",
              description: "The exact checkout URL returned by the merchant.",
            },
          },
          required: ["url"],
        },
      },
    ],
  },
] as const;

function openRedirect(args: unknown) {
  const url =
    typeof (args as { url?: unknown } | null)?.url === "string"
      ? (args as { url: string }).url
      : "";

  if (!url) {
    return {
      success: false,
      error:
        "Missing required url. Call this tool again with the exact merchant URL.",
    };
  }

  window.open(url, "_blank", "noopener,noreferrer");

  return {
    success: true,
    url,
  };
}

export async function dispatchToolCall(call: ToolCall): Promise<any> {
  const { name, id, args } = call;

  switch (name) {
    case "create_cart":
    case "update_cart":
    case "get_cart":
      return callCartMcp(name, id, args);

    case "get_checkout":
    case "update_checkout":
      return callCheckoutMcp(name, id, args);

    case "search_shop_policies_and_faqs":
      return callFaqMcp(name, id, args);

    case "search_catalog":
    case "get_product":
    case "lookup_catalog":
      return callCatalogMcp(name, id, args);

    case "notify_cart_redirect":
    case "notify_checkout_redirect":
      return openRedirect(args);

    case "get_ui_state":
      return (
        (window as any).LiveCommerceState ?? {
          ok: false,
          reason: "Commerce Layer not mounted yet.",
        }
      );

    default:
      return {
        success: false,
        error: `Unknown tool ${name}.`,
      };
  }
}