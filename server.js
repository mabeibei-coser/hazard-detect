import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env.local") });
dotenv.config({ path: path.join(__dirname, ".env") });

const { default: express } = await import("express");
const { getSession } = await import("./lib/session.js");
const { getDb, upsertUserByPhone, insertReport, getReportById } = await import("./lib/db.js");
const { buildSystemPrompt, parseResult, SCENARIO_LABELS } = await import("./lib/prompts.js");
const { signDownloadToken, verifyDownloadToken } = await import("./lib/download-token.js");
const {
  BananaRouterVisionError,
  analyzeImageWithBananaRouter,
  getBananaRouterVisionConfig,
} = await import("./lib/bananarouter-gemini-vision.js");

const PORT = Number(process.env.HAZARD_API_PORT || process.env.PORT) || 4001;
// 会员中心地址：A600 通过 HTTP 问中心"这人是不是 VIP"（不直读中心数据库，零 schema 耦合）
const CENTER_BASE_URL = process.env.ASG_CENTER_BASE_URL || "http://localhost:4002";
const BANANAROUTER_CONFIG = getBananaRouterVisionConfig();

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
    if (!BANANAROUTER_CONFIG) {
      return res.status(500).json({ error: "服务器未配置 AI API key" });
    }

    const mime = mimeType && /^image\/(jpe?g|png|webp)$/.test(mimeType) ? mimeType : "image/jpeg";
    const startedAt = Date.now();

    try {
      const content = await analyzeImageWithBananaRouter({
        config: BANANAROUTER_CONFIG,
        systemPrompt: buildSystemPrompt(scenario),
        imageBase64,
        mimeType: mime,
      });

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
      if (err instanceof BananaRouterVisionError && err.category === "timeout") {
        return res.status(504).json({ error: "请求超时（120秒），请稍后重试" });
      }
      if (err instanceof BananaRouterVisionError) {
        console.error("[analyze] BananaRouter failed:", err.category);
        return res.status(502).json({ error: "AI 请求失败，请稍后重试" });
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

// ── 单份报告台账下载（微信内 WebView 友好）──
// 微信屏蔽 H5 端 a[download] + blob URL → 改后端生成 xlsx + GET 真实下载链接。
// 鉴权双轨：
//   1) ?check=1：必须 cookie session（前端 fetch 调，cookie 一定带）→ 校验 VIP + 归属，签发 token
//   2) 实际下载：?dt=<token> 优先（用户在外部浏览器打开时 URL 自带凭证）→ cookie session 兜底
// 下载流出错不返 JSON（外部浏览器会渲染成页面），返 HTML 引导回微信。
function htmlPage(title, inner) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;padding:48px 24px;background:#f4f3ee;color:#1a1815;text-align:center;margin:0;min-height:100vh;box-sizing:border-box}.icon{font-size:64px;margin-bottom:16px}h1{font-size:20px;font-weight:700;margin:8px 0 16px}p{font-size:14px;line-height:1.7;color:#6b6962;max-width:320px;margin:0 auto 8px}.hint{background:#fff;border-radius:12px;padding:20px 24px;margin:24px auto;max-width:320px;text-align:left;box-shadow:0 1px 3px rgba(0,0,0,.04)}.hint p{margin:6px 0;max-width:none}.hint b{color:#0f766e}</style></head><body>${inner}</body></html>`;
}
const htmlLoginPrompt = () => htmlPage("登录已失效", `<div class="icon">🔒</div><h1>登录已失效</h1><p>下载链接已过期（10 分钟）或您未在微信内登录。</p><div class="hint"><p><b>请回到微信内重新打开：</b></p><p>1. 关闭这个浏览器标签</p><p>2. 回到微信</p><p>3. 重新点击「下载台账」</p></div>`);
const htmlVipPrompt = () => htmlPage("VIP 专享", `<div class="icon">👑</div><h1>下载台账为 VIP 专享</h1><p>请回到微信内开通 VIP 后下载。</p>`);
const htmlNotFoundPrompt = () => htmlPage("报告不存在", `<div class="icon">📋</div><h1>报告不存在或已失效</h1><p>请回到微信内重新识别后下载。</p>`);

app.get("/api/reports/:id/ledger.xlsx", async (req, res) => {
  const reportId = parseInt(req.params.id, 10);
  if (!reportId || reportId < 1) {
    return res.status(400).send(htmlNotFoundPrompt());
  }
  const isCheck = req.query.check === "1";

  // 鉴权解析：token 仅在实际下载时有效（check=1 必须 cookie，保证签发安全）
  let phone = null;
  let bypassMembershipCheck = false;
  const dt = typeof req.query.dt === "string" ? req.query.dt : null;
  if (dt && !isCheck) {
    const ok = verifyDownloadToken(dt, { scope: "ledger-download", ref: `report=${reportId}` });
    if (ok) {
      phone = ok.phone;
      bypassMembershipCheck = true; // 签发时已校过 VIP + 归属
    }
  }
  if (!phone) {
    const session = await getSession(req, res);
    if (!session.phone) {
      if (isCheck) return res.status(401).json({ error: "请先登录", needLogin: true });
      return res.status(401).send(htmlLoginPrompt());
    }
    phone = session.phone;
  }

  // VIP 校验（token 路径跳过）
  if (!bypassMembershipCheck) {
    const vip = await fetchIsVip(req);
    if (!vip.isVip) {
      if (isCheck) return res.status(403).json({ error: "下载台账需开通 VIP 会员", needVip: true });
      return res.status(403).send(htmlVipPrompt());
    }
  }

  // 归属校验：只有本人能下载自己的报告
  const report = getReportById(reportId, phone);
  if (!report) {
    if (isCheck) return res.status(404).json({ error: "报告不存在或已失效" });
    return res.status(404).send(htmlNotFoundPrompt());
  }

  // check=1：签 10 分钟内有效的 token，前端拼到下载 URL 上
  if (isCheck) {
    const token = signDownloadToken({ phone, scope: "ledger-download", ref: `report=${reportId}` });
    return res.json({ ok: true, downloadToken: token });
  }

  // ─── Excel 生成 ───
  const fmtTime = (ts) => {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const stripYuan = (t) => String(t || "").replace(/\s*元\s*$/, "").trim();
  const cleanFix = (t) =>
    String(t || "")
      .split("\n")
      .map((s) => s.replace(/^\d+[\.\、\s]*/, "").trim())
      .filter(Boolean)
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n");

  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("安全隐患台账");
    ws.columns = [
      { header: "日期", key: "date", width: 18 },
      { header: "场景", key: "scenario", width: 16 },
      { header: "序号", key: "idx", width: 6 },
      { header: "隐患名称", key: "name", width: 22 },
      { header: "等级", key: "level", width: 8 },
      { header: "具体描述", key: "desc", width: 40 },
      { header: "涉及规范", key: "reg", width: 26 },
      { header: "整改建议", key: "fix", width: 36 },
      { header: "预算经费", key: "budget", width: 14 },
      { header: "现场照片", key: "photo", width: 22 },
    ];
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.alignment = { vertical: "middle", horizontal: "center" };
    head.height = 22;

    const hazards = Array.isArray(report.hazards) && report.hazards.length ? report.hazards : [null];
    const firstRowNum = ws.rowCount + 1;
    hazards.forEach((h, i) => {
      const row = ws.addRow({
        date: fmtTime(report.createdAt),
        scenario: report.scenarioLabel,
        idx: h ? i + 1 : "",
        name: h ? h.hazard_name || "" : "（未发现隐患）",
        level: h && h.hazard_level ? `${h.hazard_level}风险` : "",
        desc: h ? h.hazard_description || "" : "",
        reg: h ? h.relevant_regulations || "" : "",
        fix: h ? cleanFix(h.rectification_suggestions) : "",
        budget: h ? stripYuan(h.estimated_budget) : "",
        photo: "",
      });
      row.alignment = { vertical: "top", wrapText: true };
    });
    // 现场照片：放在首行的「现场照片」列（第 10 列，0-indexed = 9）。
    // exceljs 仅支持 png/jpeg；webp 等跳过（留空），不编造。
    if (report.imageBase64 && /image\/(jpe?g|png)/i.test(report.imageMime || "")) {
      const ext = /png/i.test(report.imageMime) ? "png" : "jpeg";
      try {
        const imgId = wb.addImage({
          buffer: Buffer.from(report.imageBase64, "base64"),
          extension: ext,
        });
        ws.getRow(firstRowNum).height = 96;
        ws.addImage(imgId, {
          tl: { col: 9, row: firstRowNum - 1 },
          ext: { width: 150, height: 110 },
          editAs: "oneCell",
        });
      } catch (e) {
        console.error("[ledger] 嵌图失败:", e?.message || e);
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    const fname = `安全隐患台账_${report.scenarioLabel || "通用"}_${fmtTime(report.createdAt).replace(/[:\s-]/g, "")}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`
    );
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("[ledger] 生成失败:", err);
    res.status(500).send(htmlPage("生成失败", `<div class="icon">⚠️</div><h1>台账生成失败</h1><p>请稍后重试或联系管理员。</p>`));
  }
});

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
