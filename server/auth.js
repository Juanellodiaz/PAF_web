const crypto = require("crypto");

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret() {
  return (
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "paf-dev-secret-change-in-production"
  );
}

function signSession(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    exp: Date.now() + SESSION_MAX_AGE_MS,
  };
  const json = JSON.stringify(payload);
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(json)
    .digest("base64url");
  const body = Buffer.from(json, "utf8").toString("base64url");
  return `${body}.${sig}`;
}

function parseSessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let json;
  try {
    json = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(json)
    .digest("base64url");

  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }

  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }

  if (!data.exp || data.exp < Date.now()) return null;

  return {
    id: data.id,
    username: data.username,
    role: data.role,
    name: data.name,
  };
}

function parseSession(req) {
  return parseSessionToken(req.cookies?.paf_session);
}

function isProduction(req) {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    req.secure
  );
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
    secure: isProduction(req),
    path: "/",
  };
}

module.exports = {
  signSession,
  parseSession,
  parseSessionToken,
  isProduction,
  cookieOptions,
};
