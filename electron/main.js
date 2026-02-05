import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import handler from 'serve-handler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
const PORT = 5173; // Fixed port to match Vite/Spotify config

function createWindow() {
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
            webSecurity: false, // Allow cross-origin requests to SwitchBot/Spotify
        },
        backgroundColor: '#000000',
    });

    const isDev = !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // Production: Serve the 'dist' folder
        const server = createServer((request, response) => {
            return handler(request, response, {
                public: path.join(__dirname, '../dist'),
                rewrites: [
                    { source: '**', destination: '/index.html' } // SPA fallback
                ]
            });
        });

        server.listen(PORT, () => {
            console.log('Running at http://localhost:' + PORT);
            mainWindow.loadURL(`http://localhost:${PORT}`);
        });

        // Ensure server closes when app closes (though process exit handles it)
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
