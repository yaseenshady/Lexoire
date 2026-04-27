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

// Lexoire native bridge. Browser APIs are preferred in the UI; these are fallbacks.
contextBridge.exposeInMainWorld('lexoire', {
  platform: process.platform,
  speak: (text) => ipcRenderer.invoke('tts:speak', text),
  stopSpeech: () => ipcRenderer.invoke('tts:stop'),
  getVoiceCapabilities: () => ipcRenderer.invoke('voice:capabilities'),
  requestMic: () => ipcRenderer.invoke('mic:request'),
  startSpeech: () => ipcRenderer.invoke('speech:start'),
  stopSpeechRecognition: () => ipcRenderer.invoke('speech:stop'),
  onSpeech: (cb) => {
    ipcRenderer.removeAllListeners('speech:event');
    ipcRenderer.on('speech:event', (_, data) => cb(data));
  },
});
