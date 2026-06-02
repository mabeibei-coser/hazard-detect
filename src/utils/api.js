/**
 * hazard-detect API 客户端
 * 浏览器 → /api/analyze → Express → 讯飞 multimodal → 入库 → 返回隐患数组
 * 登录态来自「安全隐患域会员中心」的共享 cookie；A600 自己不再登录。
 */

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;
// 会员中心前台地址（开通 VIP / 登录都跳这里）。生产由 VITE_CENTER_URL 注入。
export const CENTER_URL = import.meta.env.VITE_CENTER_URL || 'http://localhost:4002/';

async function http(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `请求失败 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// 当前用户：{ phone, isVip, vipExpireAt }，未登录返 null
export async function fetchMe() {
  try {
    return await http('GET', '/me');
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
}

// 跳会员中心登录，登录完回到当前页
export function gotoCenterLogin() {
  const back = encodeURIComponent(window.location.href);
  window.location.href = `${CENTER_URL}?from=${back}`;
}

// 台账下载授权：VIP 才返回 ok，否则抛 needVip 错误
export async function authorizeLedger() {
  return http('GET', '/ledger/authorize');
}

// 图片压缩（浏览器端）：1024px 最大边 + JPEG 0.8
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxSize = 1024;
      let { width, height } = img;
      if (width > height && width > maxSize) { height = (height / width) * maxSize; width = maxSize; }
      else if (height > maxSize) { width = (width / height) * maxSize; height = maxSize; }
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      resolve({ base64, mimeType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

/**
 * 调用一次隐患识别（服务端会同步入库）。
 */
export const analyzeHazard = async (imageFile, scenario) => {
  const { base64, mimeType } = await fileToBase64(imageFile);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 125_000);
  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, imageBase64: base64, mimeType }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || `识别失败 (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data.hazards;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('请求超时（120秒），请稍后重试');
    }
    throw err;
  }
};

export default { analyzeHazard, fetchMe, gotoCenterLogin, authorizeLedger, CENTER_URL };
