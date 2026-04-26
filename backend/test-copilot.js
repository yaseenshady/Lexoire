const CopilotService = require('./dist/copilot/copilot-service').default;

const service = new CopilotService();

let chunks = [];
const onOutput = (chunk, type) => {
  console.log(`[TEST] Output (${type}):`, chunk.slice(0, 100));
  chunks.push(chunk);
};

service.execute({ prompt: 'what is 2+2?', workingDirectory: process.cwd() }, onOutput)
  .then(response => {
    console.log('[TEST] Response:', {
      success: response.success,
      outputLength: response.output.length,
      firstChunks: chunks.length,
      output: response.output.slice(0, 200)
    });
  })
  .catch(err => {
    console.error('[TEST] Error:', err);
  });

setTimeout(() => {
  console.log('[TEST] Timeout');
  process.exit(0);
}, 30000);
