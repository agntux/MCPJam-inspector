import { Hono } from "hono";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type ToolSet,
} from "ai";
import type { ChatV2Request } from "@/shared/chat-v2";
import {
  createLlmModel,
  getInvalidAnthropicToolNames,
  isAnthropicCompatibleModel,
  scrubChatGPTAppsToolResultsForBackend,
  scrubMcpAppsToolResultsForBackend,
} from "../../utils/chat-helpers";
import { isGPT5Model, isMCPJamProvidedModel } from "@/shared/types";
import { logger } from "../../utils/logger";
import { getSkillToolsAndPrompt } from "../../utils/skill-tools";
import { handleMCPJamFreeChatModel } from "../../utils/mcpjam-stream-handler";
import type { ModelMessage } from "@ai-sdk/provider-utils";
import { logUsageFireAndForget } from "../../../agntux/lib/log-usage";

const DEFAULT_TEMPERATURE = 0.7;

const chatV2 = new Hono();

chatV2.post("/", async (c) => {
  try {
    const body = (await c.req.json()) as ChatV2Request;
    const mcpClientManager = c.mcpClientManager;
    const {
      messages,
      apiKey,
      model,
      systemPrompt,
      temperature,
      selectedServers,
      requireToolApproval,
      appId,
    } = body;

    // Validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: "messages are required" }, 400);
    }

    const modelDefinition = model;
    if (!modelDefinition) {
      return c.json({ error: "model is not supported" }, 400);
    }

    // Get all tools (MCP + skills)
    const mcpTools = await mcpClientManager.getToolsForAiSdk(
      selectedServers,
      requireToolApproval ? { needsApproval: requireToolApproval } : undefined,
    );
    const { tools: skillTools, systemPromptSection: skillsPromptSection } =
      await getSkillToolsAndPrompt();

    // Apply needsApproval to skill tools when the flag is set
    const finalSkillTools = requireToolApproval
      ? Object.fromEntries(
          Object.entries(skillTools).map(([name, t]) => [
            name,
            { ...t, needsApproval: true },
          ]),
        )
      : skillTools;

    const allTools = { ...mcpTools, ...finalSkillTools };

    // Validate tool names for Anthropic-compatible models
    if (isAnthropicCompatibleModel(modelDefinition, body.customProviders)) {
      const invalidNames = getInvalidAnthropicToolNames(Object.keys(allTools));
      if (invalidNames.length > 0) {
        const nameList = invalidNames.map((n) => `'${n}'`).join(", ");
        return c.json(
          {
            error:
              `Invalid tool name(s) for Anthropic: ${nameList}. ` +
              `Tool names must only contain letters, numbers, underscores, and hyphens (max 64 characters).`,
          },
          400,
        );
      }
    }

    // Build enhanced system prompt
    const enhancedSystemPrompt = systemPrompt
      ? systemPrompt + skillsPromptSection
      : skillsPromptSection;

    // Resolve temperature (GPT-5 doesn't support it)
    const resolvedTemperature = isGPT5Model(modelDefinition.id)
      ? undefined
      : (temperature ?? DEFAULT_TEMPERATURE);

    // Helper to scrub messages for backend
    const scrubMessages = (msgs: ModelMessage[]) =>
      scrubChatGPTAppsToolResultsForBackend(
        scrubMcpAppsToolResultsForBackend(
          msgs,
          mcpClientManager,
          selectedServers,
        ),
        mcpClientManager,
        selectedServers,
      );

    // MCPJam-provided models: delegate to stream handler
    if (modelDefinition.id && isMCPJamProvidedModel(modelDefinition.id)) {
      if (!process.env.CONVEX_HTTP_URL) {
        return c.json(
          { error: "Server missing CONVEX_HTTP_URL configuration" },
          500,
        );
      }

      const modelMessages = await convertToModelMessages(messages);

      return handleMCPJamFreeChatModel({
        messages: scrubMessages(modelMessages as ModelMessage[]),
        modelId: String(modelDefinition.id),
        systemPrompt: enhancedSystemPrompt,
        temperature: resolvedTemperature,
        tools: allTools as ToolSet,
        authHeader: c.req.header("authorization"),
        mcpClientManager,
        selectedServers,
        requireToolApproval,
      });
    }

    // User-provided models: direct streamText
    // AgntUX START — Fall back to server-side API keys when client doesn't provide one.
    // This keeps keys secure on the server for self-hosted deployments.
    const serverKeyMap: Record<string, string | undefined> = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      deepseek: process.env.DEEPSEEK_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      mistral: process.env.MISTRAL_API_KEY,
      xai: process.env.XAI_API_KEY,
    };
    const effectiveApiKey = apiKey || serverKeyMap[modelDefinition.provider] || "";
    // AgntUX END
    const llmModel = createLlmModel(
      modelDefinition,
      effectiveApiKey,
      {
        ollama: body.ollamaBaseUrl,
        azure: body.azureBaseUrl,
      },
      body.customProviders,
    );

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: llmModel,
      messages: scrubMessages(modelMessages as ModelMessage[]),
      ...(resolvedTemperature !== undefined
        ? { temperature: resolvedTemperature }
        : {}),
      system: enhancedSystemPrompt,
      tools: allTools as ToolSet,
      stopWhen: stepCountIs(20),
      // AgntUX START — Log token usage to platform for credit tracking
      onFinish: appId
        ? ({ usage }) => {
            logUsageFireAndForget({
              appId,
              messageId: crypto.randomUUID(),
              model: modelDefinition?.id ?? "unknown",
              modelProvider: modelDefinition?.provider ?? "unknown",
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
            });
          }
        : undefined,
      // AgntUX END
    });

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type === "finish-step") {
          return {
            inputTokens: part.usage.inputTokens,
            outputTokens: part.usage.outputTokens,
            totalTokens: part.usage.totalTokens,
          };
        }
      },
      onError: (error) => {
        logger.error("[mcp/chat-v2] stream error", error);
        if (error instanceof Error) {
          const responseBody = (error as any).responseBody;
          if (responseBody && typeof responseBody === "string") {
            return JSON.stringify({
              message: error.message,
              details: responseBody,
            });
          }
          return error.message;
        }
        return String(error);
      },
    });
  } catch (error) {
    logger.error("[mcp/chat-v2] failed to process chat request", error);
    return c.json({ error: "Unexpected error" }, 500);
  }
});

export default chatV2;
