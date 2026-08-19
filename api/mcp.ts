import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "../src/index.js";
import { runWithToken } from "../src/client.js";

export default async function handler(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header. Provide your Kvant API Bearer token." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return runWithToken(token, async () => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const server = createServer();
    await server.connect(transport);

    return transport.handleRequest(req);
  });
}

export const config = {
  runtime: "edge",
};
