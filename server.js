const express = require('express');
const cors = require('cors');
const axios = require('axios');
const session = require('cookie-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Session for storing user data
app.use(session({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'superhandsomeme'],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// ==================== DISCORD OAuth CONFIG ====================
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `https://get-k161.onrender.com/api/auth/discord/callback`;

// ==================== OWNER CONFIG ====================
// CHANGE THIS TO YOUR DISCORD ID!
const OWNER_ID = '994109669381505044'; // Right-click yourself in Discord > Copy ID

// ==================== STORAGE (in-memory, use database in production) ====================
let scripts = [];
let panels = [];
let apiKeys = [];
let submissions = [];
let bannedHWIDs = [];

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

        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
        });

        const { username, id, avatar } = userResponse.data;
        req.session.user = { username, id, avatar };
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

// ==================== OWNER MIDDLEWARE ====================
function isOwner(req, res, next) {
    const userId = req.headers['x-user-id'] || req.query.userId || req.body.userId;
    if (userId === OWNER_ID) {
        next();
    } else {
        res.status(403).json({ error: 'Not authorized' });
    }
}

// ==================== DATA ROUTE ====================
app.get('/api/data', (req, res) => {
    const userId = req.headers['x-user-id'];
    const isOwner = userId === OWNER_ID;
    
    res.json({
        scripts: isOwner ? scripts : scripts.filter(s => s.userId === userId),
        panels: isOwner ? panels : panels.filter(p => p.userId === userId),
        keys: apiKeys,
        bannedHWIDs: bannedHWIDs,
        obfuscationsLeft: 10,
        maxObfuscations: 10,
        plan: 'basic',
        serverTime: Date.now(),
        user: req.session.user || null,
        isOwner: isOwner
    });
});

// ==================== SCRIPT ROUTES ====================

// Create script
app.post('/api/create-script', async (req, res) => {
    const { name, code, compressMode, ffaMode } = req.body;
    const userId = req.headers['x-user-id'];
    const username = req.headers['x-username'] || 'Unknown';
    
    const script = {
        id: Date.now().toString(),
        name: name,
        code: code,
        rawCode: code,
        compressMode: compressMode || false,
        ffaMode: ffaMode || false,
        status: 'active',
        userId: userId,
        username: username,
        createdAt: new Date().toISOString()
    };
    
    scripts.push(script);
    
    // Send notification to owner
    sendDiscordNotification(name, userId, username, code);
    
    res.json({ success: true, id: script.id });
});

// Update script
app.post('/api/update-script', (req, res) => {
    const { id, name, code, compressMode, ffaMode } = req.body;
    const script = scripts.find(s => s.id === id);
    if (script) {
        script.name = name;
        script.code = code;
        script.rawCode = code;
        script.compressMode = compressMode || false;
        script.ffaMode = ffaMode || false;
    }
    res.json({ success: true });
});

// Delete script
app.delete('/api/delete-script/:id', (req, res) => {
    scripts = scripts.filter(s => s.id !== req.params.id);
    res.json({ success: true });
});

// Toggle script
app.post('/api/toggle-script/:id', (req, res) => {
    const script = scripts.find(s => s.id === req.params.id);
    if (script) {
        script.status = script.status === 'active' ? 'disabled' : 'active';
    }
    res.json({ success: true });
});

// Toggle FFA
app.post('/api/toggle-ffa/:id', (req, res) => {
    const script = scripts.find(s => s.id === req.params.id);
    if (script) {
        script.ffaMode = !script.ffaMode;
    }
    res.json({ success: true });
});

// Loader endpoint
app.get('/loader/:id', (req, res) => {
    const script = scripts.find(s => s.id === req.params.id);
    if (script && script.status === 'active') {
        res.send(script.code || '-- Script content');
    } else {
        res.send('-- Script not found or disabled');
    }
});

// ==================== PANEL ROUTES ====================

app.post('/api/create-panel', (req, res) => {
    const { name, description, channelId, scriptId, hwidCooldown } = req.body;
    const panel = {
        id: Date.now().toString(),
        name: name,
        description: description || '',
        channelId: channelId,
        scriptId: scriptId,
        hwidCooldown: Number(hwidCooldown) || 0,
        userId: req.headers['x-user-id'],
        createdAt: new Date().toISOString()
    };
    panels.push(panel);
    res.json({ success: true, id: panel.id });
});

app.post('/api/update-panel', (req, res) => {
    const { id, name, description, channelId, scriptId, hwidCooldown } = req.body;
    const panel = panels.find(p => p.id === id);
    if (panel) {
        panel.name = name;
        panel.description = description || '';
        panel.channelId = channelId;
        panel.scriptId = scriptId;
        panel.hwidCooldown = Number(hwidCooldown) || 0;
    }
    res.json({ success: true });
});

app.delete('/api/delete-panel/:id', (req, res) => {
    panels = panels.filter(p => p.id !== req.params.id);
    res.json({ success: true });
});

app.post('/api/send-panel/:id', (req, res) => {
    res.json({ success: true });
});

// ==================== KEY ROUTES ====================

app.post('/api/generate-key', (req, res) => {
    const { panelId, duration, note } = req.body;
    const key = 'KEY-' + Date.now().toString(36).toUpperCase();
    const expiresAt = duration === 'permanent' ? null : Date.now() + (duration === '1h' ? 3600000 : duration === '1d' ? 86400000 : duration === '1w' ? 604800000 : duration === '1m' ? 2592000000 : duration === '1y' ? 31536000000 : 0);
    apiKeys.push({ id: Date.now().toString(), key, panelId, duration, note, expiresAt, used: false });
    res.json({ success: true, key });
});

app.delete('/api/delete-key/:id', (req, res) => {
    apiKeys = apiKeys.filter(k => k.id !== req.params.id && k.key !== req.params.id);
    res.json({ success: true });
});

// ==================== HWID ROUTES ====================

app.post('/api/ban-hwid', (req, res) => {
    const { hwid } = req.body;
    if (!bannedHWIDs.includes(hwid)) {
        bannedHWIDs.push(hwid);
    }
    res.json({ success: true });
});

app.delete('/api/unban-hwid/:hwid', (req, res) => {
    bannedHWIDs = bannedHWIDs.filter(h => h !== req.params.hwid);
    res.json({ success: true });
});

// ==================== API KEY ROUTES (User) ====================

app.post('/api/claim-key', (req, res) => {
    const { key } = req.body;
    const foundKey = apiKeys.find(k => k.key === key && !k.used);
    if (foundKey) {
        foundKey.used = true;
        res.json({ success: true, apiKey: key, plan: 'premium' });
    } else {
        res.json({ success: false, error: 'Invalid or already used key' });
    }
});

app.post('/api/remove-key', (req, res) => {
    res.json({ success: true });
});

// ==================== OWNER ROUTES ====================

// Check if user is owner
app.get('/api/check-owner', (req, res) => {
    const userId = req.headers['x-user-id'] || req.query.userId;
    res.json({ isOwner: userId === OWNER_ID });
});

// Get all submissions (owner only)
app.get('/api/owner/submissions', isOwner, (req, res) => {
    res.json({ submissions: submissions });
});

// Get all scripts (owner only)
app.get('/api/owner/scripts', isOwner, (req, res) => {
    res.json({ scripts: scripts });
});

// ==================== DISCORD NOTIFICATIONS ====================

// Send Discord notification when script is submitted
async function sendDiscordNotification(scriptName, userId, username, code) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;
    
    // Store submission
    submissions.push({
        id: Date.now().toString(),
        scriptName: scriptName,
        userId: userId,
        username: username,
        code: code,
        date: new Date().toISOString()
    });
    
    try {
        await axios.post(webhookUrl, {
            embeds: [{
                title: '📝 New Script Submitted!',
                color: 0x5865F2,
                fields: [
                    { name: '📄 Script Name', value: scriptName || 'Unnamed', inline: true },
                    { name: '👤 User', value: username || userId || 'Unknown', inline: true },
                    { name: '🆔 User ID', value: userId || 'Unknown', inline: true },
                    { name: '📏 Size', value: `${(code || '').length} characters`, inline: true },
                    { name: '📅 Time', value: new Date().toLocaleString(), inline: true }
                ],
                timestamp: new Date().toISOString()
            }]
        });
        console.log('✅ Notification sent to Discord');
    } catch (error) {
        console.error('❌ Failed to send Discord notification:', error.message);
    }
}

// Send script as file to Discord
app.post('/api/send-script-file', async (req, res) => {
    const { scriptName, userId, username, code } = req.body;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
        return res.json({ success: false, error: 'Webhook not configured' });
    }
    
    try {
        const fileContent = `-- Script: ${scriptName}\n-- User: ${username || userId}\n-- Date: ${new Date().toLocaleString()}\n-- ==============================================\n\n${code || '-- No code provided'}`;
        
        await axios.post(webhookUrl, {
            embeds: [{
                title: `📄 Script: ${scriptName}`,
                color: 0x10b981,
                fields: [
                    { name: '👤 User', value: username || 'Unknown', inline: true },
                    { name: '📏 Size', value: `${(code || '').length} characters`, inline: true },
                    { name: '📅 Time', value: new Date().toLocaleString(), inline: true }
                ],
                timestamp: new Date().toISOString()
            }],
            files: [{
                attachment: Buffer.from(fileContent, 'utf-8'),
                name: `${scriptName || 'script'}_${Date.now()}.lua`
            }]
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Failed to send file:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// ==================== SERVE HTML ====================

app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Redirect URI: ${REDIRECT_URI}`);
    console.log(`🔑 Client ID: ${DISCORD_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
    console.log(`🔐 Client Secret: ${DISCORD_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
    console.log(`🔒 Session Secret: ${process.env.SESSION_SECRET ? '✅ Set' : '❌ Missing'}`);
    console.log(`👑 Owner ID: ${OWNER_ID !== 'YOUR_DISCORD_ID_HERE' ? '✅ Set' : '⚠️ Change this!'}`);
});