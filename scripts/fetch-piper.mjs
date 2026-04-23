#!/usr/bin/env node
/**
 * fetch-piper.mjs
 *
 * Downloads the standalone Piper TTS binary from the archived `rhasspy/piper`
 * release (`2023.11.14-2`) for the host target — or a target passed via
 * `--target=<triple>` — and extracts it flat into
 * `src-tauri/binaries/piper/`.
 *
 * We use the 2023-11 archived release because piper1-gpl only ships Python
 * wheels. The C++ binaries are feature-identical for our needs (CLI TTS +
 * ONNX voices) and the download URL will remain valid indefinitely.
 *
 * Usage:
 *   node scripts/fetch-piper.mjs             # auto-detect host
 *   node scripts/fetch-piper.mjs --target=x86_64-pc-windows-msvc
 *
 * Idempotent: skips download if `src-tauri/binaries/piper/VERSION` matches.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const PIPER_VERSION = "2023.11.14-2";
const BASE = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}`;

const ASSETS = {
  "x86_64-pc-windows-msvc": { file: "piper_windows_amd64.zip", kind: "zip" },
  "x86_64-unknown-linux-gnu": { file: "piper_linux_x86_64.tar.gz", kind: "tar" },
  "aarch64-unknown-linux-gnu": { file: "piper_linux_aarch64.tar.gz", kind: "tar" },
  "x86_64-apple-darwin": { file: "piper_macos_x64.tar.gz", kind: "tar" },
  "aarch64-apple-darwin": { file: "piper_macos_aarch64.tar.gz", kind: "tar" },
};

function hostTriple() {
  const p = process.platform;
  const a = process.arch;
  if (p === "win32" && a === "x64") return "x86_64-pc-windows-msvc";
  if (p === "linux" && a === "x64") return "x86_64-unknown-linux-gnu";
  if (p === "linux" && a === "arm64") return "aarch64-unknown-linux-gnu";
  if (p === "darwin" && a === "x64") return "x86_64-apple-darwin";
  if (p === "darwin" && a === "arm64") return "aarch64-apple-darwin";
  throw new Error(`Unsupported host: ${p}/${a}`);
}

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function download(url, dest) {
  console.log(`[piper] GET ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`[piper] downloaded ${buf.length} bytes -> ${dest}`);
}

function run(cmd, args, opts = {}) {
  return new Promise((ok, err) => {
    const c = spawn(cmd, args, { stdio: "inherit", ...opts });
    c.on("error", err);
    c.on("exit", (code) => (code === 0 ? ok() : err(new Error(`${cmd} exited ${code}`))));
  });
}

async function extractZip(archive, outDir) {
  // PowerShell is always available on Windows runners. Strip the top-level
  // `piper/` folder after extraction by moving its contents up.
  await run("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${outDir}' -Force`,
  ]);
  // Windows zip from rhasspy wraps everything in `piper/`; flatten.
  const inner = join(outDir, "piper");
  if (existsSync(inner)) {
    await run("powershell", [
      "-NoProfile",
      "-Command",
      `Get-ChildItem -LiteralPath '${inner}' -Force | Move-Item -Destination '${outDir}' -Force; Remove-Item -LiteralPath '${inner}' -Force`,
    ]);
  }
}

async function extractTar(archive, outDir) {
  // Strip the top-level `piper/` directory so our resource paths are stable.
  await run("tar", ["-xzf", archive, "-C", outDir, "--strip-components=1"]);
}

async function main() {
  const args = parseArgs();
  const target = args.target || hostTriple();
  const asset = ASSETS[target];
  if (!asset) throw new Error(`Unsupported target: ${target}`);

  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "..");
  const outDir = join(root, "src-tauri", "binaries", "piper");
  const versionFile = join(outDir, "VERSION");

  const want = `${PIPER_VERSION}:${target}`;
  if (existsSync(versionFile) && readFileSync(versionFile, "utf8").trim() === want) {
    console.log(`[piper] up-to-date (${want})`);
    return;
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const url = `${BASE}/${asset.file}`;
  const archive = join(tmpdir(), `${createHash("sha1").update(url).digest("hex")}-${asset.file}`);
  if (!existsSync(archive)) {
    await download(url, archive);
  } else {
    console.log(`[piper] cached ${archive}`);
  }

  if (asset.kind === "zip") await extractZip(archive, outDir);
  else await extractTar(archive, outDir);

  const entries = readdirSync(outDir);
  if (entries.length === 0) {
    throw new Error(`extraction produced no files in ${outDir}`);
  }
  console.log(`[piper] extracted ${entries.length} entries: ${entries.join(", ")}`);

  writeFileSync(versionFile, `${want}\n`);
  console.log(`[piper] ready at ${outDir}`);
}

main().catch((e) => {
  console.error(`[piper] ${e.message}`);
  process.exit(1);
});
