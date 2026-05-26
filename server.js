import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env.local") });
dotenv.config({ path: path.join(__dirname, ".env") });

const { default: express } = await import("express");
const { getSession } = await import("./lib/session.js");
const { getDb, upsertUserByPhone, insertReport } = await import("./lib/db.js");
const { buildSystemPrompt, parseResult, SCENARIO_LABELS } = await import("./lib/prompts.js");

const PORT = Number(process.env.HAZARD_API_PORT || process.env.PORT) || 4001;
const IFLYTEK_URL =
  process.env.IFLYTEK_API_URL ||
  "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2/chat/completions";
const IFLYTEK_API_KEY = process.env.IFLYTEK_API_KEY;
const IFLYTEK_MODEL = process.env.IFLYTEK_MODEL || "astron-code-latest";

const app = express();
app.set("trust proxy", true);
// 图片 base64（压缩到 1024px / quality 0.8 后约 200-500KB，留足余量）
app.use(express.json({ limit: "12mb" }));

const PHONE_RE = /^1\d{10}$/;

function requireSession(handler) {
  return async (req, res) => {
    const session = await getSession(req, res);
    if (!session.userId) {
      return res.status(401).json({ error: "请先登录" });
    }
    req.session = session;
    return handler(req, res);
  };
}

// ── 登录 / 登出 / 当前用户 ──

app.post("/api/login", async (req, res) => {
  const phone = String(req.body?.phone || "").trim();
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ error: "请输入有效的 11 位手机号" });
  }
  try {
    const userId = upsertUserByPhone(phone);
    const session = await getSession(req, res);
    session.userId = userId;
    session.phone = phone;
    session.loggedInAt = Date.now();
    await session.save();
    res.json({ ok: true, userId, phone });
  } catch (err) {
    console.error("[login] failed:", err);
    res.status(500).json({ error: "登录失败，请稍后重试" });
  }
});

app.post("/api/logout", async (req, res) => {
  const session = await getSession(req, res);
  await session.destroy();
  res.json({ ok: true });
});

app.get("/api/me", async (req, res) => {
  const session = await getSession(req, res);
  if (!session.userId) return res.status(401).json({ error: "未登录" });
  res.json({ userId: session.userId, phone: session.phone });
});

// ── 隐患识别：调讯飞 multimodal + 入库（一次性原子）──

app.post(
  "/api/analyze",
  requireSession(async (req, res) => {
    const { scenario, imageBase64, mimeType } = req.body || {};
    if (!scenario || typeof scenario !== "string") {
      return res.status(400).json({ error: "缺少 scenario" });
    }
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "缺少图片数据" });
    }
    if (!IFLYTEK_API_KEY) {
      return res.status(500).json({ error: "服务器未配置 AI API key" });
    }

    const mime = mimeType && /^image\/(jpe?g|png|webp)$/.test(mimeType) ? mimeType : "image/jpeg";
    const startedAt = Date.now();

    try {
      const upstream = await fetch(IFLYTEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${IFLYTEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: IFLYTEK_MODEL,
          messages: [
            { role: "system", content: buildSystemPrompt(scenario) },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}` } },
                { type: "text", text: "请按照 system prompt 中的检查清单，分析这张照片中能够直接看出的安全隐患。" },
              ],
            },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        console.error("[analyze] iFlytek HTTP", upstream.status, text.slice(0, 300));
        return res.status(502).json({ error: `AI 请求失败 (${upstream.status})` });
      }

      const result = await upstream.json();
      const content = result?.choices?.[0]?.message?.content;
      if (!content) {
        return res.status(502).json({ error: "AI 返回内容为空" });
      }

      const hazards = parseResult(content);
      const durationMs = Date.now() - startedAt;

      const reportId = insertReport({
        userId: req.session.userId,
        userPhone: req.session.phone,
        createdAt: Date.now(),
        scenario,
        scenarioLabel: SCENARIO_LABELS[scenario] || scenario,
        hazardCount: hazards.length,
        report: hazards,
        durationMs,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null,
        imageBase64,
        imageMime: mime,
      });

      res.json({ ok: true, reportId, hazards, durationMs });
    } catch (err) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        return res.status(504).json({ error: "请求超时（120秒），请稍后重试" });
      }
      console.error("[analyze] failed:", err);
      res.status(500).json({ error: "识别失败，请稍后重试" });
    }
  })
);

// ── 生产模式：托管 dist/ 静态资源 ──
if (process.env.NODE_ENV === "production") {
  const distDir = path.join(__dirname, "dist");
  app.use(express.static(distDir));
  app.get("*", (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(PORT, () => {
  try {
    getDb();
    console.log(`[hazard-detect] api server on http://localhost:${PORT}`);
  } catch (err) {
    console.error("[hazard-detect] DB 初始化失败:", err);
  }
});
