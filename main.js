const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, globalShortcut } = require("electron");
const path = require("path");
const fs   = require("fs");
const os   = require("os");
const { exec } = require("child_process");

let win  = null;
let tray = null;
let isMousePassthrough = true;

const WINDOW_CONFIG = {
  width: 1366,
  height: 768,
  transparent: true,
  frame: false,
  alwaysOnTop: true,
  resizable: false,
  hasShadow: false,
  skipTaskbar: true,
  focusable: true,
  acceptFirstMouse: false,
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
    webSecurity: false
  }
};

function createWindow() {
  win = new BrowserWindow(WINDOW_CONFIG);
  win.loadFile('index.html');
  win.setIgnoreMouseEvents(true, { forward: true });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    setTimeout(() => { win.webContents.send('window-ready'); }, 1000);
    startRecentAppMonitor();
  });

  win.on('focus', () => { win.setIgnoreMouseEvents(!isMousePassthrough, { forward: true }); });
  win.on('blur',  () => { win.setIgnoreMouseEvents(true, { forward: true }); });

  setupIPC();
  createTray();
  setupGlobalShortcuts();
}

function setupIPC() {

  // ── Mouse passthrough ─────────────────────────────────────────
  ipcMain.on('set-mouse-passthrough', (event, passthrough) => {
    isMousePassthrough = passthrough;
    win.setIgnoreMouseEvents(passthrough, { forward: true });
  });

  ipcMain.on('toggle-mouse-passthrough', () => {
    isMousePassthrough = !isMousePassthrough;
    win.setIgnoreMouseEvents(isMousePassthrough, { forward: true });
  });

  // ── Abrir URL no browser ──────────────────────────────────────
  ipcMain.on('open-url', (event, url) => { shell.openExternal(url); });
  ipcMain.handle('open-url', async (event, url) => {
    await shell.openExternal(url);
    return { success: true };
  });

  // ── Abrir apps Windows ────────────────────────────────────────
  ipcMain.on('open-windows-app', (event, appName) => {
    const cmds = {
      'ms-settings:':          'start ms-settings:',
      'calculator:':           'start calculator:',
      'cmd':                   'start cmd.exe',
      'ms-settings:bluetooth': 'start ms-settings:bluetooth',
      'explorer':              'explorer.exe',
    };
    const cmd = cmds[appName] || `start ${appName}`;
    exec(cmd, (err) => { if (err) console.warn('open-windows-app:', err.message); });
  });

  // ── Janela fullscreen ─────────────────────────────────────────
  ipcMain.on('open-fullscreen-window', (event, url) => { openFullscreenWindow(url); });
  ipcMain.on('close-fullscreen-window', () => { closeFullscreenWindow(); });

  // ── Outros ───────────────────────────────────────────────────
  ipcMain.on('execute-program', (event, program) => { executeProgram(program); });
  ipcMain.on('toggle-window', () => { win.isVisible() ? win.hide() : (win.show(), win.focus()); });
  ipcMain.on('close-app', () => { app.quit(); });

  // ── Criar evento no calendário (Google Calendar via browser) ──
  ipcMain.handle('create-calendar-event', async (event, { titulo, startdt, enddt }) => {
    const fmt  = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
    const text = encodeURIComponent(titulo);
    const dates = encodeURIComponent(`${fmt(new Date(startdt))}/${fmt(new Date(enddt))}`);
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}`;
    shell.openExternal(url);
    return { success: true };
  });

  // ── Diagnóstico do calendário ─────────────────────────────────
  ipcMain.handle('diagnostico-calendario', async () => {
    return new Promise((resolve) => {
      exec('assoc .ics', { timeout: 3000 }, (err, stdout) => {
        const assoc = (stdout || '').trim();
        resolve({ ics: !err && assoc.includes('='), assoc, google: true });
      });
    });
  });

  // ── Listar apps abertas ───────────────────────────────────────
  ipcMain.handle('get-running-apps', async () => {
    return new Promise((resolve) => {
      const cmd = `powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object Name, MainWindowTitle, Id | ConvertTo-Json"`;
      exec(cmd, { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout.trim()) { resolve([]); return; }
        try {
          let procs = JSON.parse(stdout);
          if (!Array.isArray(procs)) procs = [procs];
          const EXCLUDE = ['explorer','SearchUI','ShellExperienceHost','RuntimeBroker',
            'ApplicationFrameHost','SystemSettings','electron','pet-gato'];
          const filtered = procs
            .filter(p => p.MainWindowTitle && p.MainWindowTitle.trim() !== '')
            .filter(p => !EXCLUDE.some(ex => p.Name.toLowerCase().includes(ex.toLowerCase())))
            .map(p => ({ name: p.Name, title: p.MainWindowTitle, pid: p.Id }));
          resolve(filtered);
        } catch(e) { resolve([]); }
      });
    });
  });

  // ── Fechar app por nome ou PID ────────────────────────────────
  ipcMain.handle('close-app-by-name', async (event, nameOrPid) => {
    return new Promise((resolve) => {
      let cmd;
      if (typeof nameOrPid === 'number' || /^\d+$/.test(String(nameOrPid))) {
        cmd = `taskkill /PID ${nameOrPid} /F`;
      } else {
        const safeName = String(nameOrPid).replace(/[^a-zA-Z0-9._-]/g, '');
        cmd = `taskkill /IM "${safeName}.exe" /F`;
      }
      exec(cmd, (err, stdout) => {
        if (err) resolve({ success: false, message: err.message });
        else resolve({ success: true, message: stdout.trim() });
      });
    });
  });

  // ── Fechar janela em foco ─────────────────────────────────────
  ipcMain.handle('close-last-app', async () => {
    return new Promise((resolve) => {
      const cmd = `powershell -NoProfile -Command "
        Add-Type @'
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
          [DllImport(\\"user32.dll\\")]
          public static extern IntPtr GetForegroundWindow();
          [DllImport(\\"user32.dll\\")]
          public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
        }
'@
        $hwnd = [Win32]::GetForegroundWindow()
        $pid = 0
        [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) { $proc | Select-Object Name, Id, MainWindowTitle | ConvertTo-Json }
        else { '{}' }
      "`;
      exec(cmd, { timeout: 6000 }, (err, stdout) => {
        if (err || !stdout.trim() || stdout.trim() === '{}') {
          resolve({ success: false, message: 'Nenhuma janela em foco' }); return;
        }
        try {
          const proc = JSON.parse(stdout);
          const PROTECTED = ['electron','explorer','pet-gato','powershell','cmd'];
          if (PROTECTED.some(p => proc.Name?.toLowerCase().includes(p))) {
            resolve({ success: false, message: 'Não é possível fechar este processo' }); return;
          }
          exec(`taskkill /PID ${proc.Id} /F`, (err2) => {
            if (err2) resolve({ success: false, message: err2.message });
            else resolve({ success: true, appName: proc.Name });
          });
        } catch(e) { resolve({ success: false, message: 'Erro ao processar resposta' }); }
      });
    });
  });

  // ── Monitor de apps recentes ──────────────────────────────────
  let recentApps = [];
  let knownPids  = new Set();

  const SYSTEM_PROCS = ['electron','pet-gato','explorer','searchui','shellexperiencehost',
    'runtimebroker','applicationframehost','systemsettings','powershell','cmd','conhost',
    'dllhost','sihost','taskhostw','svchost','csrss','winlogon','lsass','dwm','fontdrvhost',
    'spoolsv','wininit','services','smss','ntoskrnl','searchhost','startmenuexperiencehost',
    'textinputhost','ctfmon','audiodg','wudfhost','msiexec','taskmgr','regedit'];

  function scanApps(markAsKnown) {
    return new Promise((resolve) => {
      const cmd = `powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object Name,Id,MainWindowTitle | ConvertTo-Json -Compress"`;
      exec(cmd, { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout.trim()) { resolve([]); return; }
        try {
          let procs = JSON.parse(stdout);
          if (!Array.isArray(procs)) procs = [procs];
          const newApps = [];
          procs.forEach(p => {
            const isSystem = SYSTEM_PROCS.some(s => p.Name.toLowerCase().includes(s));
            if (!isSystem) {
              if (markAsKnown) {
                // no arranque: regista os PIDs mas NÃO adiciona ao histórico recente
                knownPids.add(p.Id);
              } else if (!knownPids.has(p.Id)) {
                // durante monitorização: só adiciona apps NOVAS
                knownPids.add(p.Id);
                newApps.push({ name: p.Name, pid: p.Id, title: p.MainWindowTitle });
              }
            }
          });
          resolve(newApps);
        } catch(_) { resolve([]); }
      });
    });
  }

  function startRecentAppMonitor() {
    // 1. Marca as apps já abertas como conhecidas (sem as adicionar ao histórico)
    scanApps(true).then(() => {
      console.log('[Monitor] Apps existentes marcadas. A monitorizar novas apps...');
    });

    // 2. Monitoriza de 1,5 em 1,5s — só deteta apps abertas APÓS o pet iniciar
    setInterval(async () => {
      const newApps = await scanApps(false);
      newApps.forEach(app => {
        recentApps.unshift(app);
        if (recentApps.length > 50) recentApps.pop();
        console.log('[Monitor] Nova app detetada:', app.name, app.title);
      });
    }, 1500);
  }

  ipcMain.handle('get-recent-app',   async () => recentApps.length > 0 ? recentApps[0] : null);

  ipcMain.handle('close-recent-app', async () => {
    return new Promise((resolve) => {
      if (recentApps.length === 0) { resolve({ success: false, message: 'Sem apps recentes' }); return; }
      const appItem = recentApps.shift();
      exec(`taskkill /PID ${appItem.pid} /F`, (err) => {
        if (err) {
          const safeName = appItem.name.replace(/[^a-zA-Z0-9._-]/g, '');
          exec(`taskkill /IM "${safeName}.exe" /F`, (err2) => {
            resolve({ success: !err2, appName: appItem.name });
          });
        } else {
          resolve({ success: true, appName: appItem.name });
        }
      });
    });
  });
}

function openFullscreenWindow(url) {
  const w = new BrowserWindow({
    fullscreen: true, frame: true, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  w.loadURL(url);
  w.webContents.on('before-input-event', (event, input) => { if (input.key === 'Escape') w.close(); });
}

function closeFullscreenWindow() {
  BrowserWindow.getAllWindows().forEach(w => { if (w !== win) w.close(); });
}

function executeProgram(programName) {
  try {
    if (programName.includes('/') || programName.includes('\\')) shell.openPath(programName);
    else shell.openExternal(programName);
  } catch(e) { console.error('executeProgram:', e.message); }
}

function createTray() {
  try {
    let trayIcon;
    const iconPaths = [
      path.join(__dirname, 'assets', 'tray-icon.png'),
      path.join(__dirname, 'assets', 'icon.png'),
      path.join(__dirname, 'assets', 'icon.ico')
    ];
    for (const p of iconPaths) {
      if (fs.existsSync(p)) { trayIcon = nativeImage.createFromPath(p); break; }
    }
    if (!trayIcon) {
      trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAXElEQVQ4jWNkYGD4z4AE/jOQARhxKWJkZGRgYGD4T64mRkZGBgZMBYyMjAwMDAwM6GxSADauWGlCZ5MDGLFpQmYzkmsCAwMDA8N/KmhC1oxVEzqbHMD0HwBQ4RcXl3pF5AAAAABJRU5ErkJggg==');
    }
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Mostrar/Esconder Pet', click: () => { win.isVisible() ? win.hide() : (win.show(), win.focus()); } },
      { label: 'Abrir Google',         click: () => { shell.openExternal('https://www.google.com'); } },
      { label: 'Abrir YouTube',        click: () => { shell.openExternal('https://www.youtube.com'); } },
      { type: 'separator' },
      { label: 'Sair',                 click: () => { app.quit(); } }
    ]);
    tray.setToolTip('Pet Gato Motivador 🐱');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => { win.isVisible() ? win.hide() : (win.show(), win.focus()); });
  } catch(e) { console.error('createTray:', e.message); }
}

function setupGlobalShortcuts() {
  try {
    globalShortcut.register('CommandOrControl+Shift+P', () => {
      if (win && win.isVisible()) win.hide(); else if (win) { win.show(); win.focus(); }
    });
    globalShortcut.register('CommandOrControl+Shift+M', () => {
      isMousePassthrough = !isMousePassthrough;
      if (win) win.setIgnoreMouseEvents(isMousePassthrough, { forward: true });
    });
  } catch(e) { console.log('setupGlobalShortcuts:', e.message); }
}

function setupAutoStart() {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: false, path: app.getPath('exe'), args: ['--hidden'] });
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
  app.whenReady().then(() => {
    setupAutoStart();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });