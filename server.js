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
// 会员中心地址：A600 通过 HTTP 问中心"这人是不是 VIP"（不直读中心数据库，零 schema 耦合）
const CENTER_BASE_URL = process.env.ASG_CENTER_BASE_URL || "http://localhost:4002";
const IFLYTEK_URL =
  process.env.IFLYTEK_API_URL ||
  "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2/chat/completions";
const IFLYTEK_API_KEY = process.env.IFLYTEK_API_KEY;
const IFLYTEK_MODEL = process.env.IFLYTEK_MODEL || "astron-code-latest";

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "12mb" }));

// 登录态来自共享 cookie：解出 phone 即视为已登录（中心是唯一签发者，A600 只读）。
function requireSession(handler) {
  return async (req, res) => {
    const session = await getSession(req, res);
    if (!session.phone) {
      return res.status(401).json({ error: "请先登录", needLogin: true });
    }
    req.session = session;
    return handler(req, res);
  };
}

// 向会员中心查 VIP（转发用户的共享 cookie，让中心按登录态判断）。
// 查不到/中心挂 → fail-closed（按非 VIP 处理，安全方向正确）。
async function fetchIsVip(req) {
  try {
    const resp = await fetch(`${CENTER_BASE_URL}/api/membership/me`, {
      headers: { cookie: req.headers.cookie || "" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { isVip: false, vipExpireAt: 0 };
    const data = await resp.json();
    return { isVip: !!data.isVip, vipExpireAt: data.vipExpireAt || 0 };
  } catch (err) {
    console.error("[membership] 查询中心失败:", err?.message || err);
    return { isVip: false, vipExpireAt: 0 };
  }
}

// ── 当前用户：phone（来自共享 cookie）+ VIP 状态（来自中心）──
app.get("/api/me", async (req, res) => {
  const session = await getSession(req, res);
  if (!session.phone) return res.status(401).json({ error: "未登录" });
  const vip = await fetchIsVip(req);
  res.json({ phone: session.phone, isVip: vip.isVip, vipExpireAt: vip.vipExpireAt });
});

// ── 隐患识别（识别免费，仅需登录）──
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

      // 识别入库：user_id 用本地 users 表 upsert（reports 结构不变，admin-hub 已依赖）
      const userId = upsertUserByPhone(req.session.phone);
      const reportId = insertReport({
        userId,
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

// ── 台账下载授权检查（VIP gate）──
// 做法 A（轻量）：前端点下载前先问这里，VIP 才放行前端生成 Excel；非 VIP 返 403 引导开通。
// VIP 状态由中心权威判断，前端不能伪造（前端只是据返回决定是否生成）。
app.get(
  "/api/ledger/authorize",
  requireSession(async (req, res) => {
    const vip = await fetchIsVip(req);
    if (!vip.isVip) {
      return res.status(403).json({
        error: "下载台账需开通 VIP 会员",
        needVip: true,
        billingUrl: `${CENTER_BASE_URL}/`,
      });
    }
    res.json({ ok: true });
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
