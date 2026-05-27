const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");
const axios = require("axios");

const REPO = "HaroldMth/HANS___MD";
const REPO_RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const REPO_API = `https://api.github.com/repos/${REPO}`;

const ROOT_SYNC_FILES = ["index.js", "package.json", "patch.js", "command.js", "ecosystem.config.js"];
const SYNC_DIRS = ["commands", "lib"];
const NEVER_SYNC = new Set([
  ".env",
  "config.js",
  "database",
  "sessions",
  "node_modules",
  ".git",
]);

function execAsync(command, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd: process.cwd(),
        maxBuffer: 15 * 1024 * 1024,
        env: process.env,
        ...opts,
      },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || stdout || err.message || "").trim();
          reject(new Error(msg || err.message));
          return;
        }
        resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
      }
    );
  });
}

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
}

function isProtected(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  if (NEVER_SYNC.has(norm)) return true;
  return NEVER_SYNC.has(norm.split("/")[0]);
}

async function detectOriginBranch() {
  for (const branch of ["main", "master"]) {
    try {
      await execAsync(`git rev-parse --verify origin/${branch}`);
      return branch;
    } catch {}
  }
  return "main";
}

async function getRemotePackageVersion() {
  const { data } = await axios.get(`${REPO_RAW}/package.json`, {
    timeout: 20000,
    responseType: "json",
  });
  return data.version || null;
}

async function listGithubJsFiles(dir) {
  const { data } = await axios.get(`${REPO_API}/contents/${dir}`, {
    timeout: 20000,
    headers: { "User-Agent": "HANS-MD-updater" },
  });
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".js"))
    .map((entry) => entry.path.replace(/\\/g, "/"));
}

async function buildHotSwapFileList() {
  const files = [...ROOT_SYNC_FILES];
  for (const dir of SYNC_DIRS) {
    const listed = await listGithubJsFiles(dir);
    files.push(...listed);
  }
  return [...new Set(files)].filter((f) => !isProtected(f));
}

async function fetchRawFile(relPath) {
  const url = `${REPO_RAW}/${relPath}`;
  const { data } = await axios.get(url, { timeout: 20000, responseType: "text" });
  return data;
}

async function syncHotSwapFiles(onProgress) {
  const files = await buildHotSwapFileList();
  const result = { files, updated: [], failed: [], skipped: [] };

  for (const relPath of files) {
    if (isProtected(relPath)) {
      result.skipped.push(relPath);
      continue;
    }
    try {
      if (onProgress) await onProgress(relPath);
      const content = await fetchRawFile(relPath);
      const localPath = path.join(process.cwd(), relPath);
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const before = fileHash(localPath);
      fs.writeFileSync(localPath, content, "utf8");
      const after = fileHash(localPath);
      if (before !== after) result.updated.push(relPath);
    } catch (err) {
      result.failed.push({ path: relPath, error: err.message });
    }
  }

  return result;
}

async function gitSync() {
  const branch = await detectOriginBranch();
  const beforeHash = (await execAsync("git rev-parse HEAD")).stdout.trim();
  const pkgBefore = fileHash("package.json");

  await execAsync("git fetch origin");
  await execAsync(`git reset --hard origin/${branch}`);

  const afterHash = (await execAsync("git rev-parse HEAD")).stdout.trim();
  const pkgAfter = fileHash("package.json");

  return {
    branch,
    changed: beforeHash !== afterHash,
    beforeHash,
    afterHash,
    packageJsonChanged: pkgBefore !== pkgAfter,
  };
}

async function runPackageInstall() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    await execAsync("pnpm install --prod");
    return "pnpm install --prod";
  }
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) {
    await execAsync("npm ci --omit=dev");
    return "npm ci --omit=dev";
  }
  await execAsync("npm install --omit=dev");
  return "npm install --omit=dev";
}

async function restartBot() {
  const pm2Name = process.env.PM2_APP_NAME || "HANS-MD";
  try {
    await execAsync(`pm2 restart ${pm2Name}`);
    return { ok: true, method: `pm2 restart ${pm2Name}` };
  } catch (pm2Err) {
    try {
      await execAsync("pm2 restart all");
      return { ok: true, method: "pm2 restart all" };
    } catch {
      setTimeout(() => process.exit(1), 1200);
      return { ok: true, method: "process.exit(1)", note: pm2Err.message };
    }
  }
}

async function getUpdateCheck(localVersion) {
  const remoteVersion = await getRemotePackageVersion();
  const isGitRepo = fs.existsSync(path.join(process.cwd(), ".git"));
  const check = {
    localVersion,
    remoteVersion,
    versionMatch: remoteVersion === localVersion,
    isGitRepo,
    localCommit: null,
    remoteCommit: null,
    commitsBehind: null,
  };

  if (isGitRepo) {
    try {
      const branch = await detectOriginBranch();
      await execAsync("git fetch origin").catch(() => {});
      check.localCommit = (await execAsync("git rev-parse --short HEAD")).stdout.trim();
      check.remoteCommit = (
        await execAsync(`git rev-parse --short origin/${branch}`)
      ).stdout
        .trim();
      const count = (
        await execAsync(`git rev-list --count HEAD..origin/${branch}`)
      ).stdout.trim();
      check.commitsBehind = Number(count) || 0;
      check.branch = branch;
    } catch (err) {
      check.gitError = err.message;
    }
  } else {
    try {
      const files = await buildHotSwapFileList();
      check.hotSwapFileCount = files.length;
    } catch (err) {
      check.hotSwapError = err.message;
    }
  }

  return check;
}

/**
 * @param {object} opts
 * @param {boolean} opts.force - sync even when version strings match
 * @param {function} [opts.onProgress] - async (message) => void
 */
async function runUpdate(opts = {}) {
  const { force = false, onProgress } = opts;
  const steps = [];
  const isGitRepo = fs.existsSync(path.join(process.cwd(), ".git"));
  const remoteVersion = await getRemotePackageVersion();
  const localVersion = require("./version").CURRENT_VERSION;

  if (!force && remoteVersion === localVersion && isGitRepo) {
    const behind = await getUpdateCheck(localVersion);
    if (behind.commitsBehind === 0) {
      return {
        ok: false,
        skipped: true,
        reason: "already_up_to_date",
        localVersion,
        remoteVersion,
        steps,
      };
    }
  }

  let packageJsonChanged = false;
  let filesChanged = 0;

  if (isGitRepo) {
    if (onProgress) await onProgress("Git: fetching and resetting to origin...");
    const gitResult = await gitSync();
    steps.push(`git reset --hard origin/${gitResult.branch}`);
    packageJsonChanged = gitResult.packageJsonChanged;
    filesChanged = gitResult.changed ? 1 : 0;
    if (!gitResult.changed && !force) {
      return {
        ok: true,
        skipped: true,
        reason: "git_already_synced",
        localVersion,
        remoteVersion,
        steps,
      };
    }
  } else {
    if (onProgress) await onProgress("Syncing commands/ and lib/ from GitHub...");
    const pkgBefore = fileHash("package.json");
    const syncResult = await syncHotSwapFiles(onProgress);
    steps.push(`hot-swap: ${syncResult.updated.length} file(s) changed`);
    if (syncResult.failed.length) {
      return {
        ok: false,
        reason: "hot_swap_partial",
        localVersion,
        remoteVersion,
        steps,
        syncResult,
      };
    }
    packageJsonChanged = pkgBefore !== fileHash("package.json");
    filesChanged = syncResult.updated.length;
  }

  if (packageJsonChanged || force) {
    if (onProgress) await onProgress("Installing dependencies...");
    const installCmd = await runPackageInstall();
    steps.push(installCmd);
  } else {
    steps.push("npm install skipped (package.json unchanged)");
  }

  return {
    ok: true,
    skipped: false,
    localVersion,
    remoteVersion,
    steps,
    packageJsonChanged,
    filesChanged,
    isGitRepo,
  };
}

module.exports = {
  runUpdate,
  getUpdateCheck,
  restartBot,
  buildHotSwapFileList,
  REPO_RAW,
};
