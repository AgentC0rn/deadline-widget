import { createPackage } from '@electron/asar';
import { rcedit } from 'rcedit';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAppIcon } from './generate-icon.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
const version = pkgJson.version;

function findIsccPath() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Inno Setup 6', 'ISCC.exe'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

async function main() {
  console.log('1/6 Ensuring Electron binary & generating multi-size app-icon.ico...');
  execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'ensure-electron.mjs')], {
    stdio: 'inherit',
  });
  const iconPath = generateAppIcon();

  console.log('2/6 Building renderer (Vite) & Electron main/preload (TypeScript)...');
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

  console.log('3/6 Creating slim production app.asar archive...');
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-widget-asar-'));
  try {
    const slimPkg = {
      name: pkgJson.name,
      productName: 'Deadline Widget',
      version,
      description: pkgJson.description,
      main: pkgJson.main,
    };
    fs.writeFileSync(
      path.join(stageDir, 'package.json'),
      JSON.stringify(slimPkg, null, 2),
      'utf-8',
    );
    fs.cpSync(path.join(rootDir, 'dist'), path.join(stageDir, 'dist'), {
      recursive: true,
    });
    fs.cpSync(path.join(rootDir, 'dist-electron'), path.join(stageDir, 'dist-electron'), {
      recursive: true,
    });
    fs.cpSync(path.join(rootDir, 'assets'), path.join(stageDir, 'assets'), {
      recursive: true,
    });

    const releaseRoot = path.join(rootDir, 'release');
    const appOutDir = path.join(releaseRoot, 'DeadlineWidget-win32-x64');
    if (fs.existsSync(appOutDir)) {
      fs.rmSync(appOutDir, { recursive: true, force: true });
    }
    fs.mkdirSync(releaseRoot, { recursive: true });

    console.log('4/6 Assembling standalone Windows executable folder...');
    const electronDistDir = path.join(rootDir, 'node_modules', 'electron', 'dist');
    fs.cpSync(electronDistDir, appOutDir, { recursive: true });

    // Remove unused locales (keep en-US and vi for smaller, faster install)
    const localesDir = path.join(appOutDir, 'locales');
    if (fs.existsSync(localesDir)) {
      const keepLocales = new Set(['en-US.pak', 'vi.pak']);
      for (const file of fs.readdirSync(localesDir)) {
        if (!keepLocales.has(file)) {
          fs.rmSync(path.join(localesDir, file), { force: true });
        }
      }
    }

    const defaultAsar = path.join(appOutDir, 'resources', 'default_app.asar');
    if (fs.existsSync(defaultAsar)) {
      fs.rmSync(defaultAsar, { force: true });
    }

    const targetAsar = path.join(appOutDir, 'resources', 'app.asar');
    await createPackage(stageDir, targetAsar);
    fs.copyFileSync(iconPath, path.join(appOutDir, 'resources', 'app-icon.ico'));

    const srcExe = path.join(appOutDir, 'electron.exe');
    const dstExe = path.join(appOutDir, 'DeadlineWidget.exe');
    fs.renameSync(srcExe, dstExe);

    console.log('5/6 Stamping DeadlineWidget.exe icon & version metadata via rcedit...');
    // Stamp on NTFS temp first to avoid any exFAT lock/timestamp quirks, then copy back
    const tempExe = path.join(stageDir, 'DeadlineWidget.exe');
    fs.copyFileSync(dstExe, tempExe);
    await rcedit(tempExe, {
      icon: iconPath,
      'file-version': version,
      'product-version': version,
      'version-string': {
        ProductName: 'Deadline Widget',
        FileDescription: 'Deadline Widget - Floating Checklist & Deadline Countdown',
        CompanyName: 'AgentC0rn',
        InternalName: 'DeadlineWidget',
        OriginalFilename: 'DeadlineWidget.exe',
        LegalCopyright: 'Copyright (c) 2026 AgentC0rn',
      },
    });
    fs.copyFileSync(tempExe, dstExe);

    console.log('6/6 Compiling Windows Setup Installer via Inno Setup 6 (ISCC.exe)...');
    const iscc = findIsccPath();
    if (!iscc) {
      throw new Error('Inno Setup 6 (ISCC.exe) was not found on this machine.');
    }
    execFileSync(
      iscc,
      [`/DMyAppVersion=${version}`, path.join(rootDir, 'installer.iss')],
      { cwd: rootDir, stdio: 'inherit' },
    );

    const installerPath = path.join(releaseRoot, `DeadlineWidget-Setup-${version}.exe`);
    const installerSizeMb = (fs.statSync(installerPath).size / (1024 * 1024)).toFixed(2);
    console.log(`\nPackaging complete!`);
    console.log(`- Standalone EXE: ${dstExe}`);
    console.log(`- Setup Installer: ${installerPath} (${installerSizeMb} MB)`);
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
