const fs = require("fs");
const path = require("path");

function readSecretFile(name) {
  const candidates = [
    path.join("/etc/secrets", name),
    path.join(process.cwd(), name),
    path.join(process.cwd(), ".secrets", name)
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, "utf8");
      const value = String(raw || "").trim();
      if (value) return value;
    } catch (_) {
      // continue to next candidate
    }
  }

  return "";
}

function getConfigValue(name) {
  const fromEnv = String(process.env[name] || "").trim();
  if (fromEnv) return fromEnv;
  return readSecretFile(name);
}

module.exports = {
  getConfigValue
};

