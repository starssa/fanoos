// Fanoos Addon Studio as a desktop app: the web Studio (dist-editor, copied to ./app) in its own window.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f0f12',
    autoHideMenuBar: true,
    // No browser CORS: the live preview can load any site, as with the Fanoos Scraper extension in a browser.
    webPreferences: { contextIsolation: true, sandbox: true, webSecurity: false },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Links (docs, GitHub…) open in the normal browser; the Studio window stays on the Studio.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!/^file:/i.test(url)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
