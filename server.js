// server.js (Autosave Enhanced)
const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');
const PROGRESS_FILE = path.join(__dirname, 'progress.json');
// In-memory cache
let usersCache = {};
let progressCache = {};
let blockedIPs = {};
let dirtyUsers = false;
let dirtyProgress = false;

// Load from file if exists
const loadFile = async (file) => {
    try {
        const data = await fs.readFile(file, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
};

// Save to file
const saveFile = async (file, data) => {
    try {
        await fs.writeFile(file, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`Error saving ${file}:`, err);
    }
};

// Initial load
(async () => {
    usersCache = await loadFile(USERS_FILE);
    progressCache = await loadFile(PROGRESS_FILE);
})();
const loadBlocked = async () => {
  blockedIPs = await loadFile(BLOCK_FILE);
};

const saveBlocked = async () => {
  await saveFile(BLOCK_FILE, blockedIPs);
};

const isBlocked = (ip) => {
  const block = blockedIPs[ip];
  return block && new Date().getTime() < block;
};

const blockIP = (ip) => {
  blockedIPs[ip] = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
  saveBlocked();
};


// 🚨 Autosave every 5 seconds
setInterval(() => {
    if (dirtyUsers) {
        saveFile(USERS_FILE, usersCache);
        dirtyUsers = false;
    }
    if (dirtyProgress) {
        saveFile(PROGRESS_FILE, progressCache);
        dirtyProgress = false;
    }
}, 5000);

// 🔐 Sign-Up
app.post('/api/signup', async (req, res) => {
    const { fullname, email, phone, country, idcard, password } = req.body;

    if (usersCache[email]) {
        return res.json({ success: false, message: 'Email already registered' });
    }

    usersCache[email] = { fullname, email, phone, country, idcard, password };
    progressCache[email] = { word: 0, excel: 0, ppt: 0 };

    dirtyUsers = true;
    dirtyProgress = true;

    res.json({ success: true, message: 'Registration successful' });
});
const ADMIN_KEY = '12345adminkey'

// 🔓 Login
app.post('/api/signin', (req, res) => {
    const { email, password } = req.body;
    const user = usersCache[email];

    if (!user || user.password !== password) {
        return res.json({ success: false, message: 'Invalid credentials' });
    }

    res.json({ success: true, message: 'Login successful', user });
});
// 🔒 View all registered users (admin access)
app.get('/api/admin/users', (req, res) => {
    const { key } = req.query;

    // Optional security key check
    if (key !== '12345adminkey') {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Send only safe user data (no passwords!)
    const safeUsers = Object.values(usersCache).map(user => ({
        fullname: user.fullname,
        email: user.email,
        phone: user.phone,
        country: user.country,
        idcard: user.idcard
    }));

    res.json({ success: true, users: safeUsers });
});
// ✅ DELETE Student by email
app.delete('/api/admin/users/:email', (req, res) => {
  const { email } = req.params;
  const adminKey = req.query.key;

  // Check the correct ADMIN_KEY
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  // Check if the user exists
  if (!usersCache[email]) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  // Delete from both caches
  delete usersCache[email];
  delete progressCache[email];

  // Mark for autosave
  dirtyUsers = true;
  dirtyProgress = true;

  res.json({ success: true, message: 'Student deleted successfully' });
});
const ALLOWED_CODES = ['africa2025', 'adminKEY789', 'wizFranky2025']; // or from .env

app.post('/api/verify-admin', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { code } = req.body;

  if (isBlocked(ip)) return res.status(403).send('Access blocked for 12 hours.');

  if (!ALLOWED_CODES.includes(code)) {
    blockIP(ip);
    await fs.appendFile('admin_denied.log', `${ip} denied at ${new Date().toISOString()}\n`);
    return res.status(403).send('Access denied. You are blocked for 12 hours.');
  }

  return res.status(200).send('Verified'); // ✅ Must respond with success for frontend
});




// 📊 Get Progress
app.get('/api/progress/:email', (req, res) => {
    const { email } = req.params;

    if (!progressCache[email]) {
        return res.status(404).json({ error: 'Progress not found' });
    }

    res.json(progressCache[email]);
});

// 🔁 Update Progress
app.post('/api/progress/:email', (req, res) => {
    const { email } = req.params;
    const { word, excel, ppt } = req.body;

    if (!progressCache[email]) {
        progressCache[email] = { word: 0, excel: 0, ppt: 0 };
    }

    progressCache[email] = {
        word: word ?? progressCache[email].word,
        excel: excel ?? progressCache[email].excel,
        ppt: ppt ?? progressCache[email].ppt,
    };

    dirtyProgress = true;

    res.json({ success: true, message: 'Progress updated' });
});

app.listen(PORT, () => {
    console.log(`⚡ Super Fast Server with Autosave running at http://localhost:${PORT}`);
});
