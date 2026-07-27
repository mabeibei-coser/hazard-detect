import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import express from "express";
import { getIronSession } from "iron-session";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixedImageBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const localKey = "d22-local-placeholder";
const sessionPassword = "d22-local-session-password-at-least-32-characters";
const phone = "13800000000";
const providerText = `模型说明（parseResult 应忽略）
[
  {
    "hazard_name": "临边缺少防护",
    "hazard_level": "严重",
    "hazard_description": "固定小图业务链路测试描述",
    "relevant_regulations": "JGJ 80-2016",
    "rectification_suggestions": "1. 设置防护栏杆",
    "estimated_budget": "¥1,000 - 2,000 元"
  }
]`;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

async function reservePort() {
  const server = http.createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

async function waitForServer(url, child, logs) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`A600 exited early (${child.exitCode}): ${logs.stderr}`);
    }
    try {
      const response = await fetch(url);
      if (response.status === 401) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`A600 did not start: ${logs.stderr}`);
}

async function stopChild(child) {
  if (child.exitCode != null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("A600 child did not stop")), 5_000),
    ),
  ]);
}

function sessionOptions() {
  return {
    password: sessionPassword,
    cookieName: "asg_member_session",
    cookieOptions: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    },
  };
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "a600-d22-"));
  const dbPath = path.join(tempDir, "hazard-test.db");
  const promptsPath = path.join(tempDir, "prompts.json");
  fs.copyFileSync(path.join(projectRoot, "data", "prompts.seed.json"), promptsPath);

  const providerRequests = [];
  const provider = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    providerRequests.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: providerText }] } }] }),
    );
  });

  const centerApp = express();
  centerApp.get("/test-login", async (req, res, next) => {
    try {
      const session = await getIronSession(req, res, sessionOptions());
      session.phone = phone;
      await session.save();
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
  centerApp.get("/api/membership/me", async (req, res, next) => {
    try {
      const session = await getIronSession(req, res, sessionOptions());
      if (!session.phone) return res.status(401).json({ error: "not logged in" });
      return res.json({ phone: session.phone, isVip: true, vipExpireAt: Date.now() + 60_000 });
    } catch (error) {
      return next(error);
    }
  });
  const center = http.createServer(centerApp);

  let child;
  const logs = { stdout: "", stderr: "" };
  try {
    const [providerPort, centerPort, appPort] = await Promise.all([
      listen(provider),
      listen(center),
      reservePort(),
    ]);
    child = spawn(process.execPath, ["server.js"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        HAZARD_API_PORT: String(appPort),
        HAZARD_DB_PATH: dbPath,
        HAZARD_PROMPTS_PATH: promptsPath,
        BANANAROUTER_API_KEY: localKey,
        BANANAROUTER_BASE_URL: `http://127.0.0.1:${providerPort}`,
        BANANAROUTER_MODEL: "gemini-vision-test",
        ASG_MEMBER_SESSION_PASSWORD: sessionPassword,
        ASG_COOKIE_SECURE: "false",
        ASG_COOKIE_PATH: "/",
        ASG_CENTER_BASE_URL: `http://127.0.0.1:${centerPort}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => (logs.stdout += chunk));
    child.stderr.on("data", (chunk) => (logs.stderr += chunk));

    const appBase = `http://127.0.0.1:${appPort}`;
    await waitForServer(`${appBase}/api/me`, child, logs);

    const noSession = await fetch(`${appBase}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: "general",
        imageBase64: fixedImageBase64,
        mimeType: "image/png",
      }),
    });
    assert.equal(noSession.status, 401);
    assert.equal(providerRequests.length, 0);

    const login = await fetch(`http://127.0.0.1:${centerPort}/test-login`);
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie?.startsWith("asg_member_session="));

    const me = await fetch(`${appBase}/api/me`, { headers: { cookie } });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json().then(({ phone: p, isVip }) => ({ phone: p, isVip })), {
      phone,
      isVip: true,
    });

    const analyze = await fetch(`${appBase}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        scenario: "general",
        imageBase64: fixedImageBase64,
        mimeType: "image/png",
      }),
    });
    assert.equal(analyze.status, 200);
    const result = await analyze.json();
    assert.equal(result.ok, true);
    assert.ok(Number.isInteger(result.reportId) && result.reportId > 0);
    assert.equal(result.hazards.length, 1);
    assert.equal(result.hazards[0].hazard_name, "临边缺少防护");
    assert.equal(result.hazards[0].hazard_level, "中");

    assert.equal(providerRequests.length, 1);
    const request = providerRequests[0];
    assert.equal(
      request.url,
      "/v1beta/models/gemini-vision-test:generateContent",
    );
    assert.equal(request.headers.authorization, `Bearer ${localKey}`);
    assert.deepEqual(request.body.contents[0].parts[0], {
      inlineData: { mimeType: "image/png", data: fixedImageBase64 },
    });
    assert.match(request.body.contents[0].parts[1].text, /分析这张照片/);

    const db = new Database(dbPath, { readonly: true });
    const history = db
      .prepare("SELECT * FROM reports WHERE user_phone = ? ORDER BY created_at DESC")
      .all(phone);
    db.close();
    assert.equal(history.length, 1);
    assert.equal(history[0].id, result.reportId);
    assert.equal(history[0].scenario, "general");
    assert.equal(history[0].image_base64, fixedImageBase64);
    assert.equal(JSON.parse(history[0].report_json)[0].hazard_level, "中");

    const prepare = await fetch(
      `${appBase}/api/reports/${result.reportId}/ledger.xlsx?check=1`,
      { headers: { cookie } },
    );
    assert.equal(prepare.status, 200);
    const { downloadToken } = await prepare.json();
    assert.ok(downloadToken && !downloadToken.includes(phone));

    const download = await fetch(
      `${appBase}/api/reports/${result.reportId}/ledger.xlsx?dt=${encodeURIComponent(downloadToken)}`,
    );
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-type") || "", /spreadsheetml/);
    const workbook = Buffer.from(await download.arrayBuffer());
    assert.ok(workbook.length > 1_000);
    assert.equal(workbook.subarray(0, 2).toString("ascii"), "PK");

    await new Promise((resolve) => setTimeout(resolve, 100));
    const combinedLogs = `${logs.stdout}\n${logs.stderr}`;
    for (const forbidden of [localKey, fixedImageBase64, providerText, "Authorization"]) {
      assert.equal(combinedLogs.includes(forbidden), false);
    }

    const distFiles = fs
      .readdirSync(path.join(projectRoot, "dist", "assets"))
      .map((name) => path.join(projectRoot, "dist", "assets", name));
    const distText = distFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    assert.equal(distText.includes(localKey), false);
    assert.equal(distText.includes(fixedImageBase64), false);

    console.log(
      JSON.stringify({
        ok: true,
        providerCalls: providerRequests.length,
        inlineImage: true,
        parsedHazards: result.hazards.length,
        historyRows: history.length,
        workbookBytes: workbook.length,
        logLeakMatches: 0,
        distLeakMatches: 0,
      }),
    );
  } finally {
    if (child) await stopChild(child);
    await Promise.all([close(provider), close(center)]);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
