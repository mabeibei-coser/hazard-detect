import assert from "node:assert/strict";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import {
  analyzeImageWithBananaRouter,
  getBananaRouterVisionConfig,
} from "../lib/bananarouter-gemini-vision.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.HAZARD_PROMPTS_PATH ||= path.join(projectRoot, "data", "prompts.seed.json");
const { buildSystemPrompt, parseResult } = await import("../lib/prompts.js");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}

function makeSyntheticHazardPng() {
  const width = 320;
  const height = 180;
  const pixels = Buffer.alloc(width * height * 4, 255);
  const paint = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 4;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
  };
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) paint(x, y, ...color);
    }
  };
  const disc = (cx, cy, rx, ry, color) => {
    for (let y = cy - ry; y <= cy + ry; y += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        if (((x - cx) ** 2) / rx ** 2 + ((y - cy) ** 2) / ry ** 2 <= 1) {
          paint(x, y, ...color);
        }
      }
    }
  };
  const thickLine = (x0, y0, x1, y1, radius, color) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i += 1) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      disc(x, y, radius, radius, color);
    }
  };

  rect(0, 0, width, 135, [226, 229, 232]);
  rect(0, 135, width, height, [147, 151, 156]);
  rect(45, 42, 105, 112, [245, 245, 240]);
  rect(45, 42, 105, 47, [80, 80, 80]);
  rect(45, 107, 105, 112, [80, 80, 80]);
  rect(45, 42, 50, 112, [80, 80, 80]);
  rect(100, 42, 105, 112, [80, 80, 80]);
  disc(68, 74, 5, 8, [35, 35, 35]);
  disc(84, 74, 5, 8, [35, 35, 35]);
  thickLine(102, 90, 145, 112, 5, [30, 30, 30]);
  thickLine(145, 112, 167, 126, 5, [30, 30, 30]);
  thickLine(167, 126, 178, 132, 3, [190, 45, 35]);
  thickLine(190, 138, 204, 145, 3, [215, 85, 25]);
  thickLine(204, 145, 250, 151, 5, [30, 30, 30]);
  disc(225, 154, 72, 16, [58, 155, 205]);
  disc(180, 131, 4, 4, [245, 190, 40]);
  disc(187, 135, 4, 4, [245, 190, 40]);

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const config = getBananaRouterVisionConfig();
assert.ok(config, "BANANAROUTER_API_KEY missing");
const startedAt = Date.now();
const content = await analyzeImageWithBananaRouter({
  config,
  systemPrompt: buildSystemPrompt("general"),
  imageBase64: makeSyntheticHazardPng().toString("base64"),
  mimeType: "image/png",
});
const match = content.match(/\[[\s\S]*\]/);
assert.ok(match, "provider response has no JSON array");
const rawHazards = JSON.parse(match[0]);
assert.ok(Array.isArray(rawHazards) && rawHazards.length > 0, "provider returned no hazards");
const hazards = parseResult(content);
assert.ok(hazards.length > 0);
for (const field of [
  "hazard_name",
  "hazard_level",
  "hazard_description",
  "relevant_regulations",
  "rectification_suggestions",
  "estimated_budget",
]) {
  assert.equal(typeof hazards[0][field], "string");
  assert.ok(hazards[0][field].length > 0);
}
console.log(
  JSON.stringify({
    ok: true,
    elapsedMs: Date.now() - startedAt,
    responseChars: content.length,
    hazardCount: hazards.length,
    schemaFields: 6,
  }),
);
