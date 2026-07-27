const DEFAULT_BASE_URL = "https://api.bananarouter.com";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";

export class BananaRouterVisionError extends Error {
  constructor(category, message) {
    super(message);
    this.name = "BananaRouterVisionError";
    this.category = category;
  }
}

export function getBananaRouterVisionConfig(env = process.env) {
  const apiKey = env.BANANAROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseURL: (env.BANANAROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: env.BANANAROUTER_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function safeError(category, status) {
  if (category === "unauthorized") {
    return new BananaRouterVisionError(category, "BananaRouter 鉴权失败");
  }
  if (category === "rate_limited") {
    return new BananaRouterVisionError(category, "BananaRouter 请求受限");
  }
  if (category === "timeout") {
    return new BananaRouterVisionError(category, "BananaRouter 请求超时");
  }
  if (category === "invalid_response") {
    return new BananaRouterVisionError(category, "BananaRouter 返回内容无效");
  }
  if (category === "provider_error") {
    return new BananaRouterVisionError(category, `BananaRouter 上游失败（HTTP ${status}）`);
  }
  return new BananaRouterVisionError("network_error", "BananaRouter 网络请求失败");
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

export async function analyzeImageWithBananaRouter({
  config,
  systemPrompt,
  imageBase64,
  mimeType,
  fetchImpl = fetch,
  timeoutMs = 120_000,
}) {
  const endpoint =
    `${config.baseURL.replace(/\/+$/, "")}/v1beta/models/` +
    `${encodeURIComponent(config.model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              {
                text: "请按照 system prompt 中的检查清单，分析这张照片中能够直接看出的安全隐患。",
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4000,
        },
      }),
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) throw safeError("unauthorized");
    if (response.status === 429) throw safeError("rate_limited");
    if (!response.ok) throw safeError("provider_error", response.status);

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw safeError("invalid_response");
    }
    const text = extractText(payload);
    if (!text) throw safeError("invalid_response");
    return text;
  } catch (error) {
    if (error instanceof BananaRouterVisionError) throw error;
    if (controller.signal.aborted) throw safeError("timeout");
    throw safeError("network_error");
  } finally {
    clearTimeout(timer);
  }
}
