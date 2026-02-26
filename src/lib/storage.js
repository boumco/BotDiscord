import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());

function resolveDataPath(relativePath) {
  return path.join(ROOT, "data", relativePath);
}

export async function readJson(relativePath, fallbackValue) {
  const p = resolveDataPath(relativePath);
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return fallbackValue;
    throw err;
  }
}

export async function writeJson(relativePath, value) {
  const p = resolveDataPath(relativePath);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(value, null, 2), "utf8");
}

export async function readState() {
  return await readJson("state.json", {});
}

export async function writeState(state) {
  await writeJson("state.json", state);
}

export async function readWhitelist() {
  return await readJson("whitelist.json", { userIds: [] });
}

export async function writeWhitelist(whitelist) {
  await writeJson("whitelist.json", whitelist);
}

