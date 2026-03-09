/* ===================================================================
   Auth — Caixa Escolar MG
   Client-side SHA-256 login guard
   =================================================================== */

const AUTH_CONFIG = {
  user: "lariucci",
  passHash: "b01b3ce6c2432fe67e535235bd985a787557c9584b56c70e855abad11d0bd871", // sha256("lariucci2026")
  sessionKey: "ce.auth",
};

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function checkAuth() {
  const token = sessionStorage.getItem(AUTH_CONFIG.sessionKey);
  if (token !== AUTH_CONFIG.passHash) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

function logout() {
  sessionStorage.removeItem(AUTH_CONFIG.sessionKey);
  window.location.href = "login.html";
}

// Guard: redirect to login if not authenticated
checkAuth();
