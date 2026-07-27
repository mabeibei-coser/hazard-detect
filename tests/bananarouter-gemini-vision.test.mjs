import assert from "node:assert/strict";
import test from "node:test";

import {
  BananaRouterVisionError,
  analyzeImageWithBananaRouter,
  getBananaRouterVisionConfig,
} from "../lib/bananarouter-gemini-vision.js";

const config = {
  apiKey: "unit-test-placeholder",
  baseURL: "https://example.test",
  model: "gemini-vision-test",
};

function assertCategory(category) {
  return (error) => {
    assert.ok(error instanceof BananaRouterVisionError);
    assert.equal(error.category, category);
    assert.doesNotMatch(error.message, /unit-test-placeholder|Authorization|response-secret/);
    return true;
  };
}

test("配置缺少 key 时关闭，默认使用已验证的 Gemini-native 供应商参数", () => {
  assert.equal(getBananaRouterVisionConfig({}), null);
  assert.deepEqual(getBananaRouterVisionConfig({ BANANAROUTER_API_KEY: " placeholder " }), {
    apiKey: "placeholder",
    baseURL: "https://api.bananarouter.com",
    model: "gemini-3.1-flash-lite",
  });
});

test("图片和文字按 Gemini inlineData 合同发送，并读取候选文本", async () => {
  let capturedUrl = "";
  let capturedInit;
  const content = await analyzeImageWithBananaRouter({
    config,
    systemPrompt: "system checklist",
    imageBase64: "fixed-image-base64",
    mimeType: "image/png",
    fetchImpl: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return Response.json({
        candidates: [{ content: { parts: [{ text: "[{\"hazard_name\":\"测试隐患\"}]" }] } }],
      });
    },
  });

  assert.equal(
    capturedUrl,
    "https://example.test/v1beta/models/gemini-vision-test:generateContent",
  );
  const headers = new Headers(capturedInit.headers);
  assert.equal(headers.get("Authorization"), "Bearer unit-test-placeholder");
  const body = JSON.parse(String(capturedInit.body));
  assert.equal(body.systemInstruction.parts[0].text, "system checklist");
  assert.deepEqual(body.contents[0].parts[0], {
    inlineData: { mimeType: "image/png", data: "fixed-image-base64" },
  });
  assert.match(body.contents[0].parts[1].text, /分析这张照片/);
  assert.equal(content, '[{"hazard_name":"测试隐患"}]');
});

test("401/403、429 和其他 HTTP 错误会被安全分类", async () => {
  for (const [status, category] of [
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate_limited"],
    [500, "provider_error"],
  ]) {
    await assert.rejects(
      analyzeImageWithBananaRouter({
        config,
        systemPrompt: "system",
        imageBase64: "image",
        mimeType: "image/jpeg",
        fetchImpl: async () => new Response("response-secret", { status }),
      }),
      assertCategory(category),
    );
  }
});

test("超时与网络失败被区分且错误不泄露", async () => {
  const timeoutFetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  await assert.rejects(
    analyzeImageWithBananaRouter({
      config,
      systemPrompt: "system",
      imageBase64: "image",
      mimeType: "image/jpeg",
      fetchImpl: timeoutFetch,
      timeoutMs: 5,
    }),
    assertCategory("timeout"),
  );

  await assert.rejects(
    analyzeImageWithBananaRouter({
      config,
      systemPrompt: "system",
      imageBase64: "image",
      mimeType: "image/jpeg",
      fetchImpl: async () => {
        throw new Error("network response-secret");
      },
    }),
    assertCategory("network_error"),
  );
});

test("坏 JSON、空候选和无文本候选不会冒充成功", async () => {
  const responses = [
    new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } }),
    Response.json({ candidates: [] }),
    Response.json({ candidates: [{ content: { parts: [] } }] }),
  ];
  for (const response of responses) {
    await assert.rejects(
      analyzeImageWithBananaRouter({
        config,
        systemPrompt: "system",
        imageBase64: "image",
        mimeType: "image/webp",
        fetchImpl: async () => response,
      }),
      assertCategory("invalid_response"),
    );
  }
});
