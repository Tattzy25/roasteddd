export const CHECKOUT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_checkout",
        description:
          "Retrieve the current state of an existing checkout session. Use this tool to check checkout status, messages, continue_url, line items, buyer state, fulfillment state, and any merchant-required next action. Do not use this for cart IDs. Do not collect payment. If a continue_url is returned and the buyer asked to pay, see final totals, or continue checkout, call notify_checkout_redirect with that exact continue_url.",
        parameters: {
          type: "OBJECT",
          properties: {
            shop_domain: {
              type: "STRING",
              description:
                "The shop domain to call (no http:// or https://). This maps to https://{shop-domain}/api/ucp/mcp.",
            },
            id: {
              type: "STRING",
              description: "The ID of the checkout session to retrieve.",
            },
          },
          required: ["shop_domain", "id"],
        },
      },
      {
        name: "update_checkout",
        description:
          "Update an existing checkout session with new information. Use this tool only for an existing checkout ID. update_checkout uses PUT semantics: each request replaces the full checkout state with the payload you send. Omit a field and it is removed from the checkout. Preserve existing line_items and buyer data unless the buyer asked to change them. Do not collect payment or send payment credentials. Do not send response-only fields such as checkout.buyer.country_code or checkout.payment.instruments[].display. If the returned checkout has continue_url and the buyer asked to pay, see final totals, or continue checkout, call notify_checkout_redirect with that exact continue_url.",
        parameters: {
          type: "OBJECT",
          properties: {
            shop_domain: {
              type: "STRING",
              description:
                "The shop domain to call (no http:// or https://). This maps to https://{shop-domain}/api/ucp/mcp.",
            },
            id: {
              type: "STRING",
              description: "The ID of the checkout session to update.",
            },
            checkout: {
              type: "OBJECT",
              description:
                "The checkout object containing the complete updated checkout state. update_checkout uses PUT semantics. Omit a field and it is removed from the checkout. There is no server-side merge of partial updates.",
              properties: {
                line_items: {
                  type: "ARRAY",
                  description:
                    "Updated array of items. Replaces existing line items.",
                  items: {
                    type: "OBJECT",
                    properties: {
                      id: {
                        type: "STRING",
                        description: "The existing checkout line item id.",
                      },
                      quantity: {
                        type: "INTEGER",
                        description:
                          "The updated quantity for this line item.",
                      },
                      item: {
                        type: "OBJECT",
                        properties: {
                          id: {
                            type: "STRING",
                            description:
                              "The product variant id for this line item.",
                          },
                        },
                        required: ["id"],
                      },
                    },
                    required: ["quantity", "item"],
                  },
                },
                buyer: {
                  type: "OBJECT",
                  description:
                    "Updated buyer information. Contact method email or phone_number may be required by merchant configuration.",
                },
                context: {
                  type: "OBJECT",
                  description:
                    "Updated provisional buyer signals for intent, localization, currency, and eligibility decisions. A shipping address supersedes these context hints.",
                  properties: {
                    address_country: { type: "STRING" },
                    address_region: { type: "STRING" },
                    postal_code: { type: "STRING" },
                    intent: { type: "STRING" },
                    language: { type: "STRING" },
                    currency: { type: "STRING" },
                    eligibility: {
                      type: "ARRAY",
                      items: { type: "STRING" },
                    },
                  },
                },
                attribution: {
                  type: "OBJECT",
                  description:
                    "Attribution metadata. Because the checkout object is replaced, resend attribution if you want to preserve it.",
                  properties: {
                    referring_domain: { type: "STRING" },
                    click_id_tag: { type: "STRING" },
                    click_id_value: { type: "STRING" },
                    activity_id_tag: { type: "STRING" },
                    activity_id_value: { type: "STRING" },
                    utm_campaign: { type: "STRING" },
                    utm_source: { type: "STRING" },
                    utm_medium: { type: "STRING" },
                    utm_content: { type: "STRING" },
                    utm_term: { type: "STRING" },
                  },
                },
                fulfillment: {
                  type: "OBJECT",
                  description:
                    "Updated fulfillment preferences. Each method must include line_item_ids.",
                },
              },
              required: ["line_items", "buyer"],
            },
          },
          required: ["shop_domain", "id", "checkout"],
        },
      },
    ],
  },
] as const;