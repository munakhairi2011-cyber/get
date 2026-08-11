const express = require('express');
const cors = require('cors');
const axios = require('axios');
const session = require('cookie-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Session for storing user data
app.use(session({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'your-secret-key'],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// Discord OAuth config
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/api/auth/discord/callback`;

// ==================== AUTH ROUTES ====================

// Start Discord login
app.get('/api/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(url);
});

// Discord OAuth callback
app.get('/api/auth/discord/callback', async (req, res) => {
    try {
        const { code } = req.query;
        
        if (!code) {
            return res.redirect('/?error=no_code');
        }

        // Exchange code for access token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        // Get user data
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
        });

        const { username, id, avatar } = userResponse.data;
        
        // Store user in session
        req.session.user = { username, id, avatar };
        
        // Redirect back to frontend with user data
        res.redirect(`/?user=${encodeURIComponent(username)}&id=${id}&avatar=${avatar || ''}`);
    } catch (error) {
        console.error('OAuth error:', error.message);
        res.redirect('/?error=auth_failed');
    }
});

// Logout
app.get('/api/auth/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
});

// ==================== DATA ROUTES ====================

// Get all data
app.get('/api/data', (req, res) => {
    // In production, this would fetch from a database
    // For now, returning mock data
    res.json({
        scripts: [],
        panels: [],
        keys: [],
        bannedHWIDs: [],
        obfuscationsLeft: 10,
        maxObfuscations: 10,
        plan: 'basic',
        serverTime: Date.now(),
        user: req.session.user || null
    });
});

// ==================== SCRIPT ROUTES ====================

// Create script
app.post('/api/create-script', (req, res) => {
    const { name, code, compressMode, ffaMode } = req.body;
    // In production, save to database
    // For demo, just return success
    res.json({
        success: true,
        id: Date.now().toString(),
        message: 'Script created!'
    });
});

// Update script
app.post('/api/update-script', (req, res) => {
    const { id, name, code, compressMode, ffaMode } = req.body;
    res.json({ success: true });
});

// Delete script
app.delete('/api/delete-script/:id', (req, res) => {
    res.json({ success: true });
});

// Toggle script
app.post('/api/toggle-script/:id', (req, res) => {
    res.json({ success: true });
});

// Toggle FFA
app.post('/api/toggle-ffa/:id', (req, res) => {
    res.json({ success: true });
});

// Loader endpoint
app.get('/loader/:id', (req, res) => {
    res.send(`
        -- Your obfuscated script would go here
        print("Hello from loader!")
        return "Script loaded"
    `);
});

// ==================== PANEL ROUTES ====================

app.post('/api/create-panel', (req, res) => {
    res.json({ success: true });
});

app.post('/api/update-panel', (req, res) => {
    res.json({ success: true });
});

app.delete('/api/delete-panel/:id', (req, res) => {
    res.json({ success: true });
});

app.post('/api/send-panel/:id', (req, res) => {
    res.json({ success: true });
});

// ==================== KEY ROUTES ====================

app.post('/api/generate-key', (req, res) => {
    const key = 'KEY-' + Date.now().toString(36).toUpperCase();
    res.json({ success: true, key });
});

app.delete('/api/delete-key/:id', (req, res) => {
    res.json({ success: true });
});

// ==================== HWID ROUTES ====================

app.post('/api/ban-hwid', (req, res) => {
    res.json({ success: true });
});

app.delete('/api/unban-hwid/:hwid', (req, res) => {
    res.json({ success: true });
});

// ==================== API KEY ROUTES ====================

app.post('/api/claim-key', (req, res) => {
    res.json({ success: true, apiKey: 'CLAIMED-' + Date.now() });
});

app.post('/api/remove-key', (req, res) => {
    res.json({ success: true });
});

// Serve HTML
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});