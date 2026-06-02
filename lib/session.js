import { getIronSession } from "iron-session";

// A600 接入「安全隐患域会员中心」后，登录态由中心(asg100)统一签发。
// A600 用【与中心同名同密钥】的共享 cookie 只读解析，自己不再签发登录。
//
// ⚠️ 跨进程共享前提：cookieName + password + cookieOptions(尤其 path/sameSite/secure)
// 必须与中心 lib/session.js 逐字节一致，否则中心写的 cookie A600 解不开。

export const COOKIE_NAME = "asg_member_session";

export const sessionOptions = {
  password: process.env.ASG_MEMBER_SESSION_PASSWORD,
  cookieName: COOKIE_NAME,
  cookieOptions: {
    secure:
      process.env.ASG_COOKIE_SECURE !== "false" &&
      process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: process.env.ASG_COOKIE_PATH || "/",
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession(req, res) {
  if (!sessionOptions.password) {
    throw new Error("ASG_MEMBER_SESSION_PASSWORD env 未配置");
  }
  return getIronSession(req, res, sessionOptions);
}
