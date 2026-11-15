const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fanoosNative', {
  request: (req) => ipcRenderer.invoke('fanoos:request', req),
  open: (req) => ipcRenderer.invoke('fanoos:open', req),
  setReferer: (host, ref) => ipcRenderer.invoke('fanoos:referer', { host, ref }),
  sniff: (action) => ipcRenderer.invoke('fanoos:sniff', action),
  requestBinary: async (url) => {
    const u8 = await ipcRenderer.invoke('fanoos:binary', url);
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  },
});
