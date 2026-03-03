import type { ChatRequest, ChatReponse } from "./api/openai/typing";
import { Message, ModelConfig, useAccessStore, useChatStore } from "./store";
import { showToast } from "./components/ui-lib";

const TIME_OUT_MS = 30000;
export const INTERNAL_TASK_MODEL = "openai/gpt-4o-mini";
type StreamEvent =
  | { type: "content"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "done" };

const makeRequestParam = (
  messages: Message[],
  options?: {
    filterBot?: boolean;
    forceModel?: string;
    stream?: boolean;
  },
): ChatRequest => {
  let sendMessages = messages.map((v) => {
    if (v.role !== "user" || !v.imageUrls || v.imageUrls.length === 0) {
      return {
        role: v.role,
        content: v.content ?? "",
      };
    }

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [];

    const text = (v.content ?? "").trim();
    if (text.length > 0) {
      parts.push({ type: "text", text });
    }

    for (const url of v.imageUrls) {
      parts.push({
        type: "image_url",
        image_url: {
          url,
        },
      });
    }

    return {
      role: v.role,
      content: parts,
    };
  });

  if (options?.filterBot) {
    sendMessages = sendMessages.filter((m) => m.role !== "assistant");
  }

  let modelConfig = useChatStore.getState().config.modelConfig;
  if (options?.forceModel) {
    modelConfig = { ...modelConfig, model: options.forceModel };
  }

  // console.log("[Request Param] ", modelConfig);

  return {
    messages: sendMessages,
    stream: options?.stream,
    ...modelConfig,
  };
};

function getHeaders() {
  const accessStore = useAccessStore.getState();
  let headers: Record<string, string> = {};

  if (accessStore.enabledAccessControl()) {
    headers["access-code"] = accessStore.accessCode;
  }

  if (accessStore.token && accessStore.token.length > 0) {
    headers["token"] = accessStore.token;
  }

  return headers;
}

export function requestOpenaiClient(path: string) {
  return (body: any, method = "POST") =>
    fetch("/api/openai", {
      method,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        path,
        ...(typeof body?.model === "string"
          ? { "x-chat-model": body.model }
          : {}),
        ...getHeaders(),
      },
      body: body && JSON.stringify(body),
    });
}

export async function requestChat(
  messages: Message[],
  options?: { forceModel?: string },
) {
  const req: ChatRequest = makeRequestParam(messages, {
    filterBot: true,
    forceModel: options?.forceModel,
  });

  const res = await requestOpenaiClient("v1/chat/completions")(req);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[Request Chat] failed", res.status, detail);
    return;
  }

  try {
    const response = (await res.json()) as ChatReponse;
    return response;
  } catch (error) {
    console.error("[Request Chat] ", error, res.body);
  }
}

export async function requestUsage() {
  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
      .getDate()
      .toString()
      .padStart(2, "0")}`;
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const now = new Date(Date.now() + ONE_DAY);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDate = formatDate(startOfMonth);
  const endDate = formatDate(now);

  const [used, subs] = await Promise.all([
    requestOpenaiClient(
      `dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
    )(null, "GET"),
    requestOpenaiClient("dashboard/billing/subscription")(null, "GET"),
  ]);

  const response = (await used.json()) as {
    total_usage?: number;
    error?: {
      type: string;
      message: string;
    };
  };

  const total = (await subs.json()) as {
    hard_limit_usd?: number;
  };

  if (response.error && response.error.type) {
    showToast(response.error.message);
    return;
  }

  if (response.total_usage) {
    response.total_usage = Math.round(response.total_usage) / 100;
  }

  return {
    used: response.total_usage,
    subscription: total.hard_limit_usd,
  };
}

export async function requestChatStream(
  messages: Message[],
  options?: {
    filterBot?: boolean;
    modelConfig?: ModelConfig;
    forceModel?: string;
    onMessage: (message: string, done: boolean) => void;
    onReasoning?: (reasoning: string, done: boolean) => void;
    onError: (error: Error, statusCode?: number) => void;
    onController?: (controller: AbortController) => void;
  },
) {
  const req = makeRequestParam(messages, {
    stream: true,
    filterBot: options?.filterBot,
    forceModel: options?.forceModel,
  });

  console.log("[Request] ", req);

  const controller = new AbortController();
  const reqTimeoutId = setTimeout(() => controller.abort(), TIME_OUT_MS);

  try {
    const res = await fetch("/api/chat-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        path: "v1/chat/completions",
        ...(typeof req?.model === "string" ? { "x-chat-model": req.model } : {}),
        ...getHeaders(),
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    clearTimeout(reqTimeoutId);

    let responseText = "";
    let reasoningText = "";
    let pendingText = "";

    const finish = () => {
      options?.onMessage(responseText, true);
      options?.onReasoning?.(reasoningText, true);
      controller.abort();
    };

    if (res.ok) {
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      options?.onController?.(controller);

      while (true) {
        // handle time out, will stop if no response in 10 secs
        const resTimeoutId = setTimeout(() => finish(), TIME_OUT_MS);
        const content = await reader?.read();
        clearTimeout(resTimeoutId);
        const text = decoder.decode(content?.value);
        pendingText += text;

        while (true) {
          const newLineIndex = pendingText.indexOf("\n");
          if (newLineIndex < 0) break;

          const rawLine = pendingText.slice(0, newLineIndex);
          pendingText = pendingText.slice(newLineIndex + 1);
          if (rawLine.trim().length === 0) {
            continue;
          }

          try {
            const event = JSON.parse(rawLine) as StreamEvent;
            if (event.type === "content") {
              responseText += event.text ?? "";
              options?.onMessage(responseText, false);
            } else if (event.type === "reasoning") {
              reasoningText += event.text ?? "";
              options?.onReasoning?.(reasoningText, false);
            } else if (event.type === "done") {
              // handled by finish()
            }
          } catch {
            responseText += (responseText.length === 0 ? "" : "\n") + rawLine;
            options?.onMessage(responseText, false);
          }
        }

        const done = !content || content.done;

        if (done) {
          break;
        }
      }

      if (pendingText.trim().length > 0) {
        try {
          const event = JSON.parse(pendingText) as StreamEvent;
          if (event.type === "content") {
            responseText += event.text ?? "";
            options?.onMessage(responseText, false);
          } else if (event.type === "reasoning") {
            reasoningText += event.text ?? "";
            options?.onReasoning?.(reasoningText, false);
          }
        } catch {
          responseText += (responseText.length === 0 ? "" : "\n") + pendingText;
          options?.onMessage(responseText, false);
        }
      }

      finish();
    } else if (res.status === 401) {
      console.error("Anauthorized");
      options?.onError(new Error("Anauthorized"), res.status);
    } else {
      console.error("Stream Error", res.body);
      options?.onError(new Error("Stream Error"), res.status);
    }
  } catch (err) {
    console.error("NetWork Error", err);
    options?.onError(err as Error);
  }
}

export async function requestWithPrompt(messages: Message[], prompt: string) {
  const textOnlyMessages = messages.map((m) => ({
    ...m,
    imageUrls: undefined,
    content: typeof m.content === "string" ? m.content : "",
  }));

  const promptMessages = textOnlyMessages.concat([
    {
      role: "user",
      content: prompt,
      date: new Date().toLocaleString(),
    },
  ]);

  const res = await requestChat(promptMessages, {
    forceModel: INTERNAL_TASK_MODEL,
  });

  const content = res?.choices?.at(0)?.message?.content;
  return typeof content === "string" ? content : "";
}

export async function requestReasoningTranslation(
  reasoning: string,
  options?: {
    targetLanguage?: string;
    model?: string;
  },
) {
  const res = await fetch("/api/reasoning-translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getHeaders(),
    },
    body: JSON.stringify({
      reasoning,
      targetLanguage: options?.targetLanguage ?? "zh-CN",
      model: options?.model,
    }),
  });

  if (!res.ok) {
    throw new Error(`Translate failed: ${res.status}`);
  }

  return (await res.json()) as {
    translated: string;
    segments: Array<{ source: string; translated: string }>;
    model: string;
  };
}

// To store message streaming controller
export const ControllerPool = {
  controllers: {} as Record<string, AbortController>,

  addController(
    sessionIndex: number,
    messageId: number,
    controller: AbortController,
  ) {
    const key = this.key(sessionIndex, messageId);
    this.controllers[key] = controller;
    return key;
  },

  stop(sessionIndex: number, messageId: number) {
    const key = this.key(sessionIndex, messageId);
    const controller = this.controllers[key];
    controller?.abort();
  },

  remove(sessionIndex: number, messageId: number) {
    const key = this.key(sessionIndex, messageId);
    delete this.controllers[key];
  },

  key(sessionIndex: number, messageIndex: number) {
    return `${sessionIndex},${messageIndex}`;
  },
};
