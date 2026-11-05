// Minimal preload: no IPC bridge yet. Lives here so when silent receipt printing / auto-update
// get wired, we have a safe boundary between the renderer (web app) and Node already in place.
// Keep contextIsolation: true and nodeIntegration: false on the BrowserWindow.
export {};
