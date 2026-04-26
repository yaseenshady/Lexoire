const { io } = require('socket.io-client');

const socket = io('http://localhost:5002', { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 100 });

let receivedChunks = [];
let done = false;
let timer = setTimeout(() => {
  console.error('[TEST] Timeout after 40 seconds');
  console.log('[TEST] Chunks received:', receivedChunks.length);
  process.exit(1);
}, 40000);

socket.on('connect', () => {
  console.log('[TEST] Connected to backend');
  socket.emit('copilot:prompt', { prompt: 'what is 2+2?' });
});

socket.on('command:chunk', (data) => {
  console.log('[TEST] Received chunk:', data.chunk ? data.chunk.slice(0, 50) : 'undefined');
  if (data.chunk) receivedChunks.push(data.chunk);
});

socket.on('command:response', (data) => {
  console.log('[TEST] Received response:', data.result ? data.result.slice(0, 100) : 'undefined');
  console.log('[TEST] Total chunks:', receivedChunks.length);
  console.log('[TEST] Total output:', receivedChunks.join(''));
  done = true;
  clearTimeout(timer);
  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('[TEST] Connection error:', err.message);
  clearTimeout(timer);
  process.exit(1);
});

socket.on('error', (err) => {
  console.error('[TEST] Socket error:', err);
  clearTimeout(timer);
  process.exit(1);
});
