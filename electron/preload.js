const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => {
    if (['toMain'].includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    if (['fromMain'].includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
});

// JARVIS native bridge. Browser APIs are preferred in the UI; these are fallbacks.
contextBridge.exposeInMainWorld('jarvis', {
  platform: process.platform,
  speak: (text) => ipcRenderer.invoke('tts:speak', text),
  stopSpeech: () => ipcRenderer.invoke('tts:stop'),
  requestMic: () => ipcRenderer.invoke('mic:request'),
  startSpeech: () => ipcRenderer.invoke('speech:start'),
  stopSpeechRecognition: () => ipcRenderer.invoke('speech:stop'),
  onSpeech: (cb) => {
    ipcRenderer.removeAllListeners('speech:event');
    ipcRenderer.on('speech:event', (_, data) => cb(data));
  },
});
