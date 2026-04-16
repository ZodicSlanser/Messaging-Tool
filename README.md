# Safqa Messaging - WhatsApp Business Platform

A professional WhatsApp messaging application built with **WPPConnect** and modern web technologies. Send messages, images, and manage WhatsApp communications through a beautiful, intuitive interface.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)
![WPPConnect](https://img.shields.io/badge/WPPConnect-1.30.0-25D366.svg)

## ✨ Features

- 🔐 **QR Code Authentication** - Secure WhatsApp Web authentication
- 💬 **Send Text Messages** - Send messages to any WhatsApp number
- 🖼️ **Send Images** - Share images with captions
- ✅ **Number Verification** - Check if a number is registered on WhatsApp
- 📊 **Real-time Status** - Live connection status monitoring
- 🎨 **Modern UI** - Beautiful, responsive interface with dark theme
- 🔄 **Auto-reconnect** - Automatic reconnection handling
- 📱 **Mobile Responsive** - Works seamlessly on all devices

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Chrome/Chromium browser (for headless mode)

### Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd /home/esawy/IdeaProjects/safqaMessaging
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment (optional):**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to customize:
   - `PORT` - Server port (default: 3000)
   - `SESSION_NAME` - WhatsApp session name (default: safqa-session)

4. **Start the application:**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to `http://localhost:3000`

## 📖 Usage

### 1. Authentication

1. Open the application in your browser
2. Wait for the QR code to appear
3. Open WhatsApp on your phone
4. Go to **Settings** → **Linked Devices** → **Link a Device**
5. Scan the QR code displayed on the screen
6. Once authenticated, you'll see the messaging interface

### 2. Send Text Message

1. Enter the recipient's phone number (with country code, no + or spaces)
   - Example: `201234567890` for Egypt
   - Example: `14155551234` for USA
2. Type your message
3. Click **Send Message**

### 3. Send Image

1. Enter the recipient's phone number
2. Provide a publicly accessible image URL
3. Add an optional caption
4. Click **Send Image**

### 4. Check Number

1. Enter a phone number
2. Click **Check Number**
3. View if the number is registered on WhatsApp

### 5. Logout

Click the **Logout** button in the header to disconnect your WhatsApp session.

## 🔌 API Endpoints

### GET `/api/status`
Get current connection status

**Response:**
```json
{
  "status": "connected",
  "authenticated": true,
  "hasQR": false
}
```

### GET `/api/qr`
Get QR code for authentication

**Response:**
```json
{
  "success": true,
  "qrCode": "data:image/png;base64,...",
  "authenticated": false
}
```

### POST `/api/send-message`
Send a text message

**Request:**
```json
{
  "number": "201234567890",
  "message": "Hello from Safqa Messaging!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": { ... }
}
```

### POST `/api/send-image`
Send an image with optional caption

**Request:**
```json
{
  "number": "201234567890",
  "imageUrl": "https://example.com/image.jpg",
  "caption": "Check out this image!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Image sent successfully",
  "data": { ... }
}
```

### POST `/api/check-number`
Verify if a number is on WhatsApp

**Request:**
```json
{
  "number": "201234567890"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "numberExists": true,
    "canReceiveMessage": true,
    "isBusiness": false
  }
}
```

### POST `/api/logout`
Logout from WhatsApp

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## 🛠️ Technology Stack

- **Backend:**
  - Node.js
  - Express.js
  - WPPConnect (WhatsApp Web API)
  - QRCode generation

- **Frontend:**
  - Vanilla JavaScript (ES6+)
  - Modern CSS with CSS Variables
  - Responsive Design
  - Google Fonts (Inter)

## 📁 Project Structure

```
safqaMessaging/
├── public/
│   ├── index.html      # Main HTML file
│   ├── styles.css      # Styling
│   └── app.js          # Frontend JavaScript
├── server.js           # Express server & WPPConnect logic
├── package.json        # Dependencies
├── .env                # Environment variables
├── .env.example        # Environment template
├── .gitignore          # Git ignore rules
└── README.md           # Documentation
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
SESSION_NAME=safqa-session
```

### Phone Number Format

Always use the international format without `+` or spaces:
- ✅ Correct: `201234567890` (Egypt)
- ✅ Correct: `14155551234` (USA)
- ❌ Wrong: `+20 123 456 7890`
- ❌ Wrong: `0123456789`

## 🐛 Troubleshooting

### QR Code Not Appearing

1. Wait 10-15 seconds for initialization
2. Check server logs for errors
3. Ensure Chrome/Chromium is installed
4. Try refreshing the page

### Message Not Sending

1. Verify you're authenticated (green status indicator)
2. Check phone number format (no + or spaces)
3. Ensure the number is registered on WhatsApp
4. Check server logs for detailed errors

### Connection Issues

1. Check if port 3000 is available
2. Verify firewall settings
3. Ensure stable internet connection
4. Try logging out and re-authenticating

### Session Expired

If your session expires:
1. Click the **Logout** button
2. Wait for the QR code to regenerate
3. Scan the new QR code with your phone

## 🔒 Security Notes

- Session data is stored locally in the `tokens/` directory
- Never commit `.env` or `tokens/` to version control
- Use HTTPS in production environments
- Implement rate limiting for production use
- Add authentication for API endpoints in production

## 📝 Development

### Run in Development Mode

```bash
npm run dev
```

This uses `nodemon` for automatic server restart on file changes.

### Debugging

Enable debug mode in `server.js`:
```javascript
debug: true,
logQR: true
```

## 🚀 Production Deployment

1. **Set environment variables:**
   ```bash
   export PORT=3000
   export SESSION_NAME=production-session
   ```

2. **Install PM2 (recommended):**
   ```bash
   npm install -g pm2
   pm2 start server.js --name safqa-messaging
   pm2 save
   pm2 startup
   ```

3. **Use a reverse proxy (nginx):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

## 📄 License

ISC License - feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📧 Support

For issues and questions:
- Check the troubleshooting section
- Review server logs
- Open an issue on the repository

## 🙏 Acknowledgments

- [WPPConnect Team](https://github.com/wppconnect-team/wppconnect) for the amazing WhatsApp Web API
- [Express.js](https://expressjs.com/) for the web framework
- [Google Fonts](https://fonts.google.com/) for the Inter font family

---

**Made with ❤️ for WhatsApp Business Communication**
# Messaging-Tool
