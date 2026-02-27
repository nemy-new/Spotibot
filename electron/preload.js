const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSources: (opts) => ipcRenderer.invoke('get-sources', opts)
});
