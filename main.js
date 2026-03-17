const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: '智能股票管家',
    icon: path.join(__dirname, 'assets/icon.png')
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3008');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile('frontend/dist/index.html');
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startBackend() {
  const testPort = 3003;
  const tester = net.createServer();
  
  tester.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log('Backend already running on port 3003, skipping...');
      return;
    }
  });
  
  tester.once('listening', () => {
    tester.close();
    const backendPath = path.join(__dirname, 'backend/src/index.js');
    backendProcess = spawn('node', [backendPath], {
      stdio: 'pipe'
    });
    
    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
    });
  });
  
  tester.listen(testPort);
}

app.whenReady().then(() => {
  startBackend();
  
  setTimeout(() => {
    createWindow();
  }, 2000);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (backendProcess) {
    backendProcess.kill();
  }
  
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
