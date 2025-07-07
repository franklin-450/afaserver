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

// 🔓 Login
app.post('/api/signin', (req, res) => {
    const { email, password } = req.body;
    const user = usersCache[email];

    if (!user || user.password !== password) {
        return res.json({ success: false, message: 'Invalid credentials' });
    }

    res.json({ success: true, message: 'Login successful', user });
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
