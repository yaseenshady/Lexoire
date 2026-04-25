const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let mainWindow;
let backendProcess;
let backendPort = 5000;
let backendReady = false;

// Determine if running from packaged app or development
const isDev = !app.isPackaged;
const resourcesPath = isDev
  ? path.join(__dirname, '..')
  : path.join(process.resourcesPath, 'app');

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function findAvailablePort(startPort = 5000) {
  for (let port = startPort; port < startPort + 100; port++) {
    if (await checkPortAvailable(port)) {
      return port;
    }
  }
  throw new Error('No available ports found');
}

function startBackend() {
  return new Promise((resolve, reject) => {
    findAvailablePort(backendPort)
      .then((port) => {
        backendPort = port;
        const backendPath = isDev
          ? path.join(resourcesPath, 'backend', 'dist', 'server.js')
          : path.join(resourcesPath, 'backend', 'dist', 'server.js');

        const env = {
          ...process.env,
          PORT: backendPort.toString(),
          NODE_ENV: isDev ? 'development' : 'production',
        };

        console.log(`Starting backend on port ${backendPort}`);
        console.log(`Backend path: ${backendPath}`);

        backendProcess = spawn('node', [backendPath], {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        backendProcess.stdout.on('data', (data) => {
          console.log(`[Backend] ${data}`);
        });

        backendProcess.stderr.on('data', (data) => {
          console.error(`[Backend Error] ${data}`);
        });

        backendProcess.on('error', (err) => {
          console.error('Failed to start backend:', err);
          reject(err);
        });

        // Wait a bit for backend to start, then check if it's listening
        setTimeout(() => {
          const client = net.createConnection(backendPort, '127.0.0.1');
          client.on('connect', () => {
            client.destroy();
            backendReady = true;
            console.log('Backend is ready');
            resolve();
          });
          client.on('error', () => {
            // Backend might still be starting, retry
            const retryClient = net.createConnection(backendPort, '127.0.0.1');
            retryClient.on('connect', () => {
              retryClient.destroy();
              backendReady = true;
              console.log('Backend is ready');
              resolve();
            });
            retryClient.on('error', () => {
              console.error('Backend is not responding');
              reject(new Error('Backend failed to start'));
            });
          });
        }, 1000);
      })
      .catch(reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  // In production, load from backend URL. In dev, try Vite dev server first.
  let frontendUrl;
  if (isDev) {
    frontendUrl = `http://localhost:${backendPort}`;
  } else {
    frontendUrl = `http://localhost:${backendPort}`;
  }

  console.log(`Loading frontend from: ${frontendUrl}`);
  mainWindow.loadURL(frontendUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About JARVIS',
          click: () => {
            console.log('JARVIS Voice Automation v1.0.0');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('ready', async () => {
  try {
    // Always start the backend in Electron app
    await startBackend();
    createWindow();
  } catch (err) {
    console.error('Failed to start app:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Clean up backend process
  if (backendProcess) {
    backendProcess.kill();
  }
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
