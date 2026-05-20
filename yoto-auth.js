import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, ".yoto-tokens.json");

// ─── Guardar / Carregar tokens ────────────────────────────────────────────────

function guardaTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

function carregaTokens() {
  // 1. Intentar des de variable d'entorn (GitHub Actions)
  if (process.env.YOTO_TOKENS) {
    try {
      return JSON.parse(process.env.YOTO_TOKENS);
    } catch {
      console.error("❌ YOTO_TOKENS no és un JSON vàlid");
    }
  }
  // 2. Intentar des de fitxer local
  if (fs.existsSync(TOKEN_FILE)) {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  }
  return null;
}

function tokenCaducat(accessToken) {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64").toString("utf8")
    );
    return payload.exp * 1000 < Date.now() + 30000;
  } catch {
    return true;
  }
}

// ─── Renovar token ────────────────────────────────────────────────────────────

async function renovaToken(refreshToken, clientId) {
  const res = await fetch("https://login.yotoplay.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Error renovant token: ${data.error}`);
  return data;
}

// ─── Login inicial (Device Flow) ──────────────────────────────────────────────

async function login(clientId) {
  console.log("\n🔐 Autenticació amb Yoto...\n");

  const res = await fetch("https://login.yotoplay.com/oauth/device/code", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      scope: "family:library:view family:library:edit offline_access",
      audience: "https://api.yotoplay.com",
    }),
  });

  const { device_code, verification_uri_complete, user_code, interval = 5 } =
    await res.json();

  console.log("👉 Ves a aquesta URL al teu mòbil o ordinador:");
  console.log(`\n   ${verification_uri_complete}\n`);
  console.log(`   Codi: ${user_code}\n`);
  console.log("⏳ Esperant que completis l'autenticació...\n");

  let intervalMs = interval * 1000;
  while (true) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const tokenRes = await fetch("https://login.yotoplay.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code,
        client_id: clientId,
        audience: "https://api.yotoplay.com",
      }),
    });

    const body = await tokenRes.json();

    if (tokenRes.ok) {
      console.log("✅ Autenticat correctament!\n");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📋 Copia aquest JSON i guarda'l com a secret YOTO_TOKENS");
      console.log("   a GitHub (Settings → Secrets → New repository secret):");
      console.log("");
      console.log(JSON.stringify(body));
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      return body;
    }

    if (body.error === "slow_down") intervalMs += 5000;
    else if (body.error !== "authorization_pending")
      throw new Error(body.error_description || body.error);
  }
}

// ─── Obtenir access token vàlid ───────────────────────────────────────────────

export async function obtenirAccessToken(clientId) {
  let tokens = carregaTokens();

  if (!tokens) {
    tokens = await login(clientId);
    guardaTokens(tokens);
    return tokens.access_token;
  }

  if (tokenCaducat(tokens.access_token)) {
    console.log("🔄 Renovant token...");
    const nous = await renovaToken(tokens.refresh_token, clientId);
    tokens = { ...tokens, ...nous };
    guardaTokens(tokens);
  }

  return tokens.access_token;
}