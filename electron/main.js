import { app, BrowserWindow, dialog, ipcMain, desktopCapturer } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

// Disable GPU Acceleration
app.disableHardwareAcceleration();

// DEBUG LOGGING SETUP
let logPath = null;

function getLogPath() {
    if (logPath) return logPath;
    try {
        // Try Documents folder first
        logPath = path.join(app.getPath('documents'), 'spotibot_debug.log');
    } catch (e) {
        // Fallback to temp dir if Documents fails (e.g. app not ready)
        logPath = path.join(os.tmpdir(), 'spotibot_debug.log');
    }
    return logPath;
}

function log(message) {
    try {
        const timestamp = new Date().toISOString();
        const dest = getLogPath();
        if (dest) {
            fs.appendFileSync(dest, `[${timestamp}] ${message}\n`);
        }
    } catch (e) {
        // Ignore logging errors to prevent infinite loops
    }
}

// Global Error Handlers - Show Native Dialog
process.on('uncaughtException', (error) => {
    const msg = `CRITICAL ERROR (Uncaught Exception): ${error.stack || error}`;
    log(msg);
    dialog.showErrorBox('SpotiBot Startup Error', msg);
    app.quit();
});

process.on('unhandledRejection', (reason) => {
    const msg = `CRITICAL ERROR (Unhandled Rejection): ${reason}`;
    log(msg);
    // Optional: Show dialog for rejections too? Maybe redundant if it crashes.
});

log('--------------------------------------------------');
log(`App Starting. Platform: ${process.platform}, Arch: ${process.arch}`);
log(`Electron Version: ${process.versions.electron}`);
log(`Chrome Version: ${process.versions.chrome}`);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
const PORT = 5173;
let serverPort = 0;

// Handle Deep Linking Setup
try {
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient('spotibot', process.execPath, [path.resolve(process.argv[1])]);
        }
    } else {
        app.setAsDefaultProtocolClient('spotibot');
    }
    log('Deep linking setup complete.');
} catch (e) {
    log(`Deep link setup failed: ${e.message}`);
}

function createWindow() {
    log('Creating Window...');
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        vibrancy: 'under-window',
        visualEffectState: 'active',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js')
        },
        backgroundColor: '#000000',
    });

    // Handle External Links (e.g. Spotify Login)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:')) {
            import('electron').then(({ shell }) => shell.openExternal(url));
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    log('Window created options set.');

    const isDev = !app.isPackaged;
    log(`Is Dev Mode: ${isDev}`);

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
        serverPort = 5173;
    } else {
        // Production
        const indexPath = path.join(__dirname, '../dist-web/index.html');
        log(`Loading file from: ${indexPath}`);

        // Verify if file exists
        try {
            if (fs.existsSync(indexPath)) {
                log('Index file exists.');
            } else {
                log('Index file MISSING at path!');
            }
        } catch (e) {
            log(`Error checking file existence: ${e.message}`);
        }

        mainWindow.loadFile(indexPath)
            .then(() => log('loadFile promise resolved successfully'))
            .catch(e => log(`loadFile FAILED: ${e.message}`));

        serverPort = -1;
    }

    mainWindow.on('closed', () => {
        log('Window closed.');
        mainWindow = null;
    });
}

// Unified Deep Link Handler
function handleDeepLink(url) {
    console.log("Deep Link:", url);
    if (mainWindow && url.startsWith('spotibot://callback')) {
        try {
            const urlObj = new URL(url);
            const code = urlObj.searchParams.get('code');

            if (code) {
                console.log("Redirecting app with code:", code);

                if (serverPort > 0) {
                    // Dev mode or Server mode
                    const targetUrl = `http://localhost:${serverPort}/?code=${code}`;
                    mainWindow.loadURL(targetUrl);
                } else {
                    // Production File Mode
                    // Using query param with loadFile
                    mainWindow.loadFile(path.join(__dirname, '../dist-web/index.html'), { query: { code: code } });
                }

                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.focus();
            }
        } catch (e) {
            console.error("Deep link parsing error:", e);
        }
    }
}

// Single Instance Lock (Win/Linux)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log("Another instance is running. Quitting...");
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }

        // On Windows, the deep link is in the argv
        const deepLink = commandLine.find(arg => arg.startsWith('spotibot://'));
        if (deepLink) {
            handleDeepLink(deepLink);
        }
    });

    app.whenReady().then(() => {
        log('App is Ready. Creating window...');
        createWindow();

        // Check for deep link on initial startup (Windows)
        if (process.platform === 'win32') {
            const initialDeepLink = process.argv.find(arg => arg.startsWith('spotibot://'));
            if (initialDeepLink) {
                log(`Initial deep link detected: ${initialDeepLink}`);
                setTimeout(() => handleDeepLink(initialDeepLink), 1000);
            }
        }

        app.on('activate', () => {
            log('App activated.');
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    // Handle Custom Protocol (macOS)
    app.on('open-url', (event, url) => {
        log(`open-url event: ${url}`);
        event.preventDefault();
        handleDeepLink(url);
    });

    // Handle Screen Capture Sources
    ipcMain.handle('get-sources', async (event, opts) => {
        log('get-sources requested');
        return await desktopCapturer.getSources(opts);
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
