const { io } = require('socket.io-client');

const socket = io('http://localhost:5001', { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 100 });

let receivedChunks = [];
let done = false;

socket.on('connect', () => {
  console.log('[SOCKET TEST] Connected to backend');
  socket.emit('copilot:prompt', { prompt: 'what is 2+2?' });
});

socket.on('command:chunk', (data) => {
  console.log('[SOCKET TEST] Received chunk:', data.chunk.slice(0, 50));
  receivedChunks.push(data.chunk);
});

socket.on('command:response', (data) => {
  console.log('[SOCKET TEST] Received response:', data.result?.slice(0, 100));
  console.log('[SOCKET TEST] Total chunks received:', receivedChunks.length);
  console.log('[SOCKET TEST] Total output:', receivedChunks.join(''));
  done = true;
  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('[SOCKET TEST] Connection error:', err);
  process.exit(1);
});

socket.on('error', (err) => {
  console.error('[SOCKET TEST] Socket error:', err);
});

setTimeout(() => {
  console.error('[SOCKET TEST] Timeout');
  console.log('[SOCKET TEST] Chunks received:', receivedChunks.length);
  process.exit(1);
}, 40000);
