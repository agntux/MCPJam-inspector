// AgntUX: Server-side provider configuration endpoint.
// Tells the client which LLM providers have server-side API keys configured.
// Only provider names are exposed — never actual keys.

import { Hono } from "hono";

const configRoutes = new Hono();

configRoutes.get("/server-providers", (c) => {
  const providers: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push("anthropic");
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  if (process.env.DEEPSEEK_API_KEY) providers.push("deepseek");
  if (process.env.GOOGLE_API_KEY) providers.push("google");
  if (process.env.MISTRAL_API_KEY) providers.push("mistral");
  if (process.env.XAI_API_KEY) providers.push("xai");
  return c.json({ providers });
});

export default configRoutes;
