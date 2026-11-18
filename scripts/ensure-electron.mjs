import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = path.join(rootDir, 'node_modules', 'electron');
const electronExe = path.join(electronDir, 'dist', 'electron.exe');

if (process.platform === 'win32' && !fs.existsSync(electronExe)) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(electronDir, 'package.json'), 'utf-8'),
  );
  const localAppData = process.env.LOCALAPPDATA ?? '';
  const cacheDir = path.join(localAppData, 'electron', 'Cache');

  const findZip = (dir) => {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = findZip(full);
        if (nested) return nested;
      } else if (entry.name === `electron-v${pkg.version}-win32-x64.zip`) {
        return full;
      }
    }
    return null;
  };

  let zipPath = findZip(cacheDir);
  if (!zipPath) {
    try {
      execFileSync(process.execPath, [path.join(electronDir, 'install.js')], {
        stdio: 'inherit',
      });
    } catch {
      // Zip is now cached even if exFAT utimes extraction threw
    }
    zipPath = findZip(cacheDir);
  }

  if (zipPath) {
    const distDir = path.join(electronDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    try {
      execFileSync('tar.exe', ['-m', '-xf', zipPath, '-C', distDir], {
        stdio: 'ignore',
      });
    } catch {
      // Ignore non-fatal utimes warnings on exFAT
    }
    fs.writeFileSync(path.join(electronDir, 'path.txt'), 'electron.exe', 'utf-8');
  }
}
