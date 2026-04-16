// Load .env for local dev; on cPanel env vars are set via the panel
try { await import('dotenv/config'); } catch {}
import express from 'express';
import cors from 'cors';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from 'baileys';
import https from 'https';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const router = express.Router();
const PORT = process.env.PORT || 3000;
const TOKENS_DIR = path.join(__dirname, 'tokens');
const BASE_PATH = process.env.BASE_PATH || '';

// Middleware
router.use(cors());
router.use(express.json());
router.use(express.static(path.join(__dirname, 'public')));

// Global state
let sock = null;
let qrCodeData = null;
let isAuthenticated = false;
let connectionStatus = 'disconnected';
let initRetryCount = 0;
const MAX_INIT_RETRIES = 3;

// Clear session tokens to force fresh QR code generation
function clearSessionTokens() {
    if (fs.existsSync(TOKENS_DIR)) {
        fs.rmSync(TOKENS_DIR, { recursive: true, force: true });
        console.log('Cleared old session tokens');
    }
}

// Fetch WA Web version using node:https (avoids undici WASM crash on shared hosting)
// Mirrors Baileys' fetchLatestWaWebVersion: fetches sw.js and extracts client_revision
function fetchWAVersion() {
    return new Promise((resolve, reject) => {
        https.get('https://web.whatsapp.com/sw.js', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const match = data.match(/client_revision.{0,5}?(\d{5,})/);
                if (match) {
                    resolve([2, 3000, Number(match[1])]);
                } else {
                    reject(new Error('Could not extract client_revision from sw.js'));
                }
            });
        }).on('error', reject);
    });
}

// Format phone number to Baileys JID
function formatJid(number) {
    const digits = number.replace(/[^\d]/g, '');
    if (!digits || digits.length < 10) return null;
    return `${digits}@s.whatsapp.net`;
}

// Initialize Baileys client
async function initializeClient(forceNewSession = false) {
    // Reset state
    qrCodeData = null;
    isAuthenticated = false;
    connectionStatus = 'connecting';

    if (forceNewSession) {
        clearSessionTokens();
    }

    console.log('Initializing Baileys client...');

    let version;
    try {
        version = await fetchWAVersion();
        console.log('Fetched WA version:', version);
    } catch (err) {
        console.warn('Could not fetch WA version, using Baileys default:', err.message);
    }

    const { state, saveCreds } = await useMultiFileAuthState(TOKENS_DIR);

    sock = makeWASocket({
        auth: state,
        ...(version && { version }),
        browser: Browsers.ubuntu('Chrome'),
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code received');
            qrCodeData = await QRCode.toDataURL(qr);
            connectionStatus = 'qr_ready';
            initRetryCount = 0;
        }

        if (connection === 'open') {
            console.log('WhatsApp connected successfully');
            isAuthenticated = true;
            qrCodeData = null;
            connectionStatus = 'connected';
            initRetryCount = 0;
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const loggedOut = statusCode === DisconnectReason.loggedOut;

            console.log('Connection closed. Reason:', statusCode, loggedOut ? '(logged out)' : '');

            isAuthenticated = false;
            connectionStatus = 'disconnected';
            sock = null;

            if (loggedOut) {
                clearSessionTokens();
                initRetryCount = 0;
                initializeClient(true);
                return;
            }

            // Non-logout disconnects: reconnect with retry limit
            initRetryCount++;
            if (initRetryCount <= MAX_INIT_RETRIES) {
                console.log(`Reconnecting... (attempt ${initRetryCount}/${MAX_INIT_RETRIES})`);
                initializeClient(false);
            } else {
                console.error(`Failed to connect after ${MAX_INIT_RETRIES} attempts. Use POST /api/restart to try again.`);
            }
        }
    });
}

// --- API Routes ---

// Get connection status
router.get('/api/status', (req, res) => {
    res.json({
        status: connectionStatus,
        authenticated: isAuthenticated,
        hasQR: qrCodeData !== null,
    });
});

// Get QR Code
router.get('/api/qr', (req, res) => {
    if (isAuthenticated) {
        return res.json({ success: false, message: 'Already authenticated', authenticated: true });
    }
    if (!qrCodeData) {
        return res.json({ success: false, message: 'QR Code not ready yet. Please wait...', status: connectionStatus });
    }
    res.json({ success: true, qrCode: qrCodeData, authenticated: false });
});

// Restart / re-initialize connection (force fresh QR)
router.post('/api/restart', async (req, res) => {
    try {
        console.log('Restart requested...');
        if (sock) {
            sock.end();
            sock = null;
        }
        isAuthenticated = false;
        qrCodeData = null;
        connectionStatus = 'connecting';
        initRetryCount = 0;

        initializeClient(true);

        res.json({ success: true, message: 'Restarting connection... QR code will be available shortly.' });
    } catch (error) {
        console.error('Error restarting:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send text message
router.post('/api/send-message', async (req, res) => {
    try {
        if (!isAuthenticated || !sock) {
            return res.status(401).json({ success: false, error: 'WhatsApp not authenticated. Please scan QR code first.' });
        }

        const { number, message } = req.body;
        if (!number || !message) {
            return res.status(400).json({ success: false, error: 'Number and message are required' });
        }

        const jid = formatJid(number);
        if (!jid) {
            return res.status(400).json({ success: false, error: 'Invalid phone number. Please provide a valid number with country code (e.g., 201234567890)' });
        }

        console.log('Sending message to:', jid);
        const result = await sock.sendMessage(jid, { text: message });

        res.json({ success: true, message: 'Message sent successfully', data: result });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send message with image
router.post('/api/send-image', async (req, res) => {
    try {
        if (!isAuthenticated || !sock) {
            return res.status(401).json({ success: false, error: 'WhatsApp not authenticated' });
        }

        const { number, imageUrl, caption } = req.body;
        if (!number || !imageUrl) {
            return res.status(400).json({ success: false, error: 'Number and imageUrl are required' });
        }

        const jid = formatJid(number);
        if (!jid) {
            return res.status(400).json({ success: false, error: 'Invalid phone number. Please provide a valid number with country code (e.g., 201234567890)' });
        }

        console.log('Sending image to:', jid);
        const result = await sock.sendMessage(jid, { image: { url: imageUrl }, caption: caption || '' });

        res.json({ success: true, message: 'Image sent successfully', data: result });
    } catch (error) {
        console.error('Error sending image:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check if number is registered on WhatsApp
router.post('/api/check-number', async (req, res) => {
    try {
        if (!isAuthenticated || !sock) {
            return res.status(401).json({ success: false, error: 'WhatsApp not authenticated' });
        }

        const { number } = req.body;
        if (!number) {
            return res.status(400).json({ success: false, error: 'Number is required' });
        }

        const digits = number.replace(/[^\d]/g, '');
        const [result] = await sock.onWhatsApp(digits);

        res.json({
            success: true,
            data: {
                numberExists: result?.exists || false,
                id: result ? { user: result.jid?.replace('@s.whatsapp.net', '') } : null,
                isBusiness: false,
            },
        });
    } catch (error) {
        console.error('Error checking number:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Logout
router.post('/api/logout', async (req, res) => {
    try {
        if (sock) {
            await sock.logout();
            sock.end();
            sock = null;
            isAuthenticated = false;
            qrCodeData = null;
            connectionStatus = 'disconnected';

            setTimeout(() => {
                initRetryCount = 0;
                initializeClient(true);
            }, 2000);
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Debug: log what paths Express receives
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.originalUrl} (path: ${req.path})`);
    next();
});

// Mount router at both base path and root to handle both cPanel Passenger and local dev
if (BASE_PATH) app.use(BASE_PATH, router);
app.use('/', router);

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Initializing WhatsApp connection...');
    await initializeClient(false);
});

// Export for Passenger compatibility
export default app;

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    if (sock) sock.end();
    process.exit(0);
});
