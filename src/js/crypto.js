// ---------- Helpers ----------
function b64encode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// ---------- AES Record Encryption ----------
window.generateAESKey = async function () {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

window.encryptAES = async function (plaintext, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  return {
    iv: b64encode(iv),
    data: b64encode(ciphertext)
  };
};

window.decryptAES = async function (payload, aesKey) {
  const iv = b64decode(payload.iv);
  const data = b64decode(payload.data);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    data
  );

  return new TextDecoder().decode(plaintext);
};

// ---------- User Access Key (PBKDF2) ----------
window.deriveUAK = async function (password, ethAddress) {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(ethAddress.toLowerCase()),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// ---------- Doctor User Access Key (prototype) ----------
window.deriveUAKForDoctor = async function (doctorAddress) {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(doctorAddress.toLowerCase()),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("doctor-uak"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// ---------- Record Master Key Wrapping ----------
window.wrapRMK = async function (rmk, uak) {
  const rawRMK = new Uint8Array(await crypto.subtle.exportKey("raw", rmk));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    uak,
    rawRMK
  );

  return JSON.stringify({
    iv: b64encode(iv),
    data: b64encode(wrapped)
  });
};

window.unwrapRMK = async function (payload, uak) {
  const parsed = JSON.parse(payload);

  const rawRMK = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(parsed.iv) },
    uak,
    b64decode(parsed.data)
  );

  return crypto.subtle.importKey(
    "raw",
    rawRMK,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"]
  );
};

// ---------- Password Helpers ----------
function isStrongPassword(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  input.type = input.type === "password" ? "text" : "password";
}

// ---------- Temporary Key From Proxy Token ----------
window.deriveTempKeyFromToken = async function (token) {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(token),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("proxy-temp-key"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

window.generateRecoveryKey = function () {
  const arr = crypto.getRandomValues(new Uint8Array(32));
  return b64encode(arr);
};

window.deriveRecoveryUAK = async function (recoveryKey, ethAddress) {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(recoveryKey),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("recovery-" + ethAddress.toLowerCase()),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};
