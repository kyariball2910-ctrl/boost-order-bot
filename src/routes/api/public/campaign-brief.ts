import { createFileRoute } from "@tanstack/react-router";
import { generateCampaignBrief } from "../../../lib/campaign-brief.server";

export const Route = createFileRoute("/api/public/campaign-brief")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { tokenAddress?: string };
          const tokenAddress = body?.tokenAddress?.trim();
          if (!tokenAddress) {
            return Response.json({ ok: false, error: "Token contract is required." }, { status: 400 });
          }

          const result = await generateCampaignBrief(tokenAddress);
          return Response.json(result, { status: result.ok ? 200 : 400 });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
