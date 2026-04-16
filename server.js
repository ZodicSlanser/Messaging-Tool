require('dotenv').config();
const express = require('express');
const cors = require('cors');
const wppconnect = require('@wppconnect-team/wppconnect');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_NAME = process.env.SESSION_NAME || 'safqa-session';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Global variables
let client = null;
let qrCodeData = null;
let isAuthenticated = false;
let connectionStatus = 'disconnected';

// Clear old session tokens to force fresh QR code generation
function clearSessionTokens() {
    const tokensDir = path.join(__dirname, 'tokens');
    if (fs.existsSync(tokensDir)) {
        fs.rmSync(tokensDir, { recursive: true, force: true });
        console.log('🗑️  Cleared old session tokens');
    }
}

// Initialize WPPConnect client
async function initializeClient(forceNewSession = false) {
    try {
        // Reset state
        qrCodeData = null;
        isAuthenticated = false;
        connectionStatus = 'connecting';

        if (forceNewSession) {
            clearSessionTokens();
        }

        console.log('Initializing WPPConnect client...');

        client = await wppconnect.create({
            session: SESSION_NAME,
            catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
                console.log('📱 QR Code received, attempt:', attempts);
                qrCodeData = base64Qr;
                connectionStatus = 'qr_ready';
            },
            statusFind: (statusSession, session) => {
                console.log('Status Session:', statusSession);

                if (statusSession === 'isLogged' || statusSession === 'qrReadSuccess' || statusSession === 'chatsAvailable' || statusSession === 'inChat') {
                    isAuthenticated = true;
                    qrCodeData = null;
                    connectionStatus = 'connected';
                    console.log('✅ WhatsApp authenticated successfully!');
                } else if (statusSession === 'notLogged' || statusSession === 'browserClose' || statusSession === 'qrReadError' || statusSession === 'autocloseCalled') {
                    connectionStatus = statusSession;
                } else {
                    connectionStatus = statusSession;
                }
            },
            headless: true,
            devtools: false,
            useChrome: false,
            debug: false,
            logQR: true,
            browserArgs: [
                '--disable-web-security',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage'
            ],
            autoClose: 0, // Disable auto-close so user has time to scan QR
            deviceSyncTimeout: 0, // Disable device sync timeout (default 180s also triggers auto-close)
            disableWelcome: true,
            createPathFileToken: true,
            folderNameToken: 'tokens',
        });

        console.log('✅ Client initialized successfully');

        // Set up event listeners
        client.onStateChange((state) => {
            console.log('State changed:', state);
            connectionStatus = state;
            if (state === 'CONFLICT' && client) {
                client.useHere();
            }
            if (state === 'CONNECTED') {
                isAuthenticated = true;
                qrCodeData = null;
            }
        });

        client.onStreamChange((state) => {
            console.log('Stream state:', state);
        });

        client.onIncomingCall(async (call) => {
            console.log('Incoming call:', call);
        });

        return client;
    } catch (error) {
        console.error('❌ Error initializing client:', error.message);
        connectionStatus = 'error';

        // Auto-retry with fresh session if it failed
        console.log('🔄 Retrying with fresh session in 5 seconds...');
        setTimeout(() => {
            initializeClient(true);
        }, 5000);
    }
}

// API Routes

// Get connection status
app.get('/api/status', (req, res) => {
    res.json({
        status: connectionStatus,
        authenticated: isAuthenticated,
        hasQR: qrCodeData !== null
    });
});

// Get QR Code
app.get('/api/qr', async (req, res) => {
    try {
        if (isAuthenticated) {
            return res.json({
                success: false,
                message: 'Already authenticated',
                authenticated: true
            });
        }

        if (!qrCodeData) {
            return res.json({
                success: false,
                message: 'QR Code not ready yet. Please wait...',
                status: connectionStatus
            });
        }

        res.json({
            success: true,
            qrCode: qrCodeData,
            authenticated: false
        });
    } catch (error) {
        console.error('Error getting QR code:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Restart / re-initialize connection (force fresh QR)
app.post('/api/restart', async (req, res) => {
    try {
        console.log('🔄 Restart requested...');
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.log('Client close error (ignored):', e.message);
            }
            client = null;
        }
        isAuthenticated = false;
        qrCodeData = null;
        connectionStatus = 'connecting';

        // Re-initialize with fresh session
        initializeClient(true);

        res.json({
            success: true,
            message: 'Restarting connection... QR code will be available shortly.'
        });
    } catch (error) {
        console.error('Error restarting:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send text message
app.post('/api/send-message', async (req, res) => {
    try {
        if (!isAuthenticated || !client) {
            return res.status(401).json({
                success: false,
                error: 'WhatsApp not authenticated. Please scan QR code first.'
            });
        }

        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({
                success: false,
                error: 'Number and message are required'
            });
        }

        // Format number (remove spaces, dashes, etc.)
        let formattedNumber = number.replace(/[^\d]/g, '');

        // Validate number has enough digits
        if (!formattedNumber || formattedNumber.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number. Please provide a valid number with country code (e.g., 201234567890)'
            });
        }

        // Format with @c.us suffix
        formattedNumber = `${formattedNumber}@c.us`;

        console.log('Sending message to:', formattedNumber);

        // Send message
        const result = await client.sendText(formattedNumber, message);

        console.log('Message sent:', result);

        res.json({
            success: true,
            message: 'Message sent successfully',
            data: result
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send message with image
app.post('/api/send-image', async (req, res) => {
    try {
        if (!isAuthenticated || !client) {
            return res.status(401).json({
                success: false,
                error: 'WhatsApp not authenticated'
            });
        }

        const { number, imageUrl, caption } = req.body;

        if (!number || !imageUrl) {
            return res.status(400).json({
                success: false,
                error: 'Number and imageUrl are required'
            });
        }

        let formattedNumber = number.replace(/[^\d]/g, '');

        // Validate number has enough digits
        if (!formattedNumber || formattedNumber.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number. Please provide a valid number with country code (e.g., 201234567890)'
            });
        }

        // Format with @c.us suffix
        formattedNumber = `${formattedNumber}@c.us`;

        console.log('Sending image to:', formattedNumber);

        const result = await client.sendImage(
            formattedNumber,
            imageUrl,
            'image',
            caption || ''
        );

        res.json({
            success: true,
            message: 'Image sent successfully',
            data: result
        });
    } catch (error) {
        console.error('Error sending image:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get contact info
app.post('/api/check-number', async (req, res) => {
    try {
        if (!isAuthenticated || !client) {
            return res.status(401).json({
                success: false,
                error: 'WhatsApp not authenticated'
            });
        }

        const { number } = req.body;

        if (!number) {
            return res.status(400).json({
                success: false,
                error: 'Number is required'
            });
        }

        let formattedNumber = number.replace(/[^\d]/g, '');

        const result = await client.checkNumberStatus(`${formattedNumber}@c.us`);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error checking number:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Logout
app.post('/api/logout', async (req, res) => {
    try {
        if (client) {
            await client.logout();
            isAuthenticated = false;
            qrCodeData = null;
            connectionStatus = 'disconnected';
            client = null;

            // Reinitialize client
            setTimeout(() => {
                initializeClient();
            }, 2000);
        }

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('📱 Initializing WhatsApp connection...');

    // Initialize WPPConnect with existing session (if any) or generate new QR
    await initializeClient(false);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n⚠️ Shutting down gracefully...');
    if (client) {
        await client.close();
    }
    process.exit(0);
});
