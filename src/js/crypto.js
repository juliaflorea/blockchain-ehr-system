// ---------- Helpers ----------

// function to convert binary data into base64 string because that is what we need for blockchain
function b64encode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// function to convert base64 string back into binary data
function b64decode(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// ---------- AES Record Encryption ----------

// function to generate the random encryption key for a record 
window.generateAESKey = async function () { // use browser web crypto APIto generate the key
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, // uses Advanced Encryption Standard in Galois/Counter Mode with a 256-bit key
    true,
    ["encrypt", "decrypt"] // key can encrypt and decrypt
  );
};  

// function to encrypt a plaintext string using AES-GCM with the provided key
window.encryptAES = async function (plaintext, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // generates a random initialization vectorof 12 bytes
  const encoded = new TextEncoder().encode(plaintext); // encodes thr plaintext string into bytes becuase encryption uses bytes, not text

  const ciphertext = await crypto.subtle.encrypt( // encrypts the data using the encrytion alg, the key, the IV and the encoded text
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  return { // it returns an object containing the IV and ciphertext
    iv: b64encode(iv),
    data: b64encode(ciphertext)
  };
};

// function to decrypt the ciphertext using AES-GCM with the provided key
window.decryptAES = async function (payload, aesKey) {
  const iv = b64decode(payload.iv); // decodes the IV and ciphertext from base64 back into binary data
  const data = b64decode(payload.data); // decrypts the ciphertext using the encryption algorithm, the key, the IV and the ciphertext

  const plaintext = await crypto.subtle.decrypt( // it returns the decrypted plaintext as bytes, which we then decode back into a string using TextDecoder
    { name: "AES-GCM", iv },
    aesKey,
    data
  );

  return new TextDecoder().decode(plaintext);
};

// ---------- User Access Key (PBKDF2) ----------

// function to derive a user access key (UAK) from the user's password and Ethereum address using PBKDF2 key derivation function
window.deriveUAK = async function (password, ethAddress) {
  
  const enc = new TextEncoder(); // creates a TextEncoder instance to encode the password and Ethereum address into bytes, which is required for the key derivation function
  const keyMaterial = await crypto.subtle.importKey( // imports the password as a key material for key derivation
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey( // derives a key with the provided password
    {
      name: "PBKDF2", 
      salt: enc.encode(ethAddress.toLowerCase()), // ensures the same password will generate different keys for different users
      iterations: 100000, // uses 100,000 iterations to make the key derivation process slower and more resistant to brute-force attacks
      hash: "SHA-256" // uses SHA-256 as the underlying hash function for PBKDF2
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

// ---------- Doctor User Access Key prototype  ----------

// function to derive a doctor user access key (UAK) from the doctor's Ethereum address using PBKDF2 key derivation function
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

// function to wrap the record master key (RMK) with the user access key (UAK) so that the RMK can be stored on the blockchain and only decrypted by someone with the correct UAK
window.wrapRMK = async function (rmk, uak) {
  const rawRMK = new Uint8Array(await crypto.subtle.exportKey("raw", rmk)); // convertsthe Rmk from a CryptoKey object into raw bytes that can be encrypted

  const wrapped = await crypto.subtle.encrypt( // encrypts the raw RMK with the UAK and a random IV
    { name: "AES-GCM", iv }, 
    uak,
    rawRMK
  );

  return JSON.stringify({ // returns the wrapped RMK as a JSON string containing the IV and the encrypted data, both encoded in base64 
    iv: b64encode(iv),
    data: b64encode(wrapped)
  });
};

// function to unwrap the record master key (RMK) using the user access key (UAK) by decrypting the wrapped RMK and importing it back into a CryptoKey object 
window.unwrapRMK = async function (payload, uak) {
  const parsed = JSON.parse(payload); // parses the JSON string to extract the IV and encrypted data

  const rawRMK = await crypto.subtle.decrypt( // decrypts the encrypted RMK using the UAK and the IV
    { name: "AES-GCM", iv: b64decode(parsed.iv) },
    uak,
    b64decode(parsed.data)
  );

  return crypto.subtle.importKey( // imports the decrypted raw RMK back into a CryptoKey object that can be used for encryption and decryption of the records
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

// function to derive a temporary encryption key from a proxy token for encrypting records that are shared, without giving them access to the patient's main user access key (UAK)
window.deriveTempKeyFromToken = async function (token) { 
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey( // imports the proxy token as key material for key derivation
    "raw",
    enc.encode(token),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey( // derives a temporary key with the provided proxy token
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

// ---------- Recovery Key Generation and UAK Derivation ----------

// function to generate a random recovery key that can be used for account recovery in case the user forgets their password
window.generateRecoveryKey = function () {
  const arr = crypto.getRandomValues(new Uint8Array(32)); // generates a random 32-byte recovery key using the browser's cryptographic random number generator and encodes it in base64
  return b64encode(arr);
};

// function to derive a user access key (UAK) from the recovery key and Ethereum address using PBKDF2 key derivation function, similar to how we derive the UAK from the password, but with a different salt to ensure it generates a different key
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
      salt: enc.encode("recovery-" + ethAddress.toLowerCase()), // uses a different salt than the regular UAK derivation to ensure it generates a different key
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};
