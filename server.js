// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();
const PORT = 4000;

app.use(cors());
app.use(bodyParser.json());

const USERS_FILE = 'users.json';
const PROGRESS_FILE = 'progress.json';

// Helper functions
const readJSON = (file) => JSON.parse(fs.existsSync(file) ? fs.readFileSync(file) : '{}');
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Sign Up
app.post('/api/signup', (req, res) => {
    const { fullname, email, phone, country, idcard, password } = req.body;
    const users = readJSON(USERS_FILE);

    if (users[email]) {
        return res.json({ success: false, message: 'Email already registered' });
    }

    users[email] = {
        fullname,
        email,
        phone,
        country,
        idcard,
        password
    };

    writeJSON(USERS_FILE, users);

    // Initialize progress
    const progress = readJSON(PROGRESS_FILE);
    progress[email] = { word: 0, excel: 0, ppt: 0 };
    writeJSON(PROGRESS_FILE, progress);

    res.json({ success: true, message: 'Registration successful' });
});

// Login
app.post('/api/signin', (req, res) => {
    const { email, password } = req.body;
    const users = readJSON(USERS_FILE);

    const user = users[email];
    if (!user || user.password !== password) {
        return res.json({ success: false, message: 'Invalid credentials' });
    }

    res.json({ success: true, message: 'Login successful', user });
});

// Get Progress
app.get('/api/progress/:email', (req, res) => {
    const { email } = req.params;
    const progress = readJSON(PROGRESS_FILE);

    if (!progress[email]) {
        return res.status(404).json({ error: 'Progress not found for this user' });
    }

    res.json(progress[email]);
});

// Update Progress (Optional route)
app.post('/api/progress/:email', (req, res) => {
    const { email } = req.params;
    const { word, excel, ppt } = req.body;
    const progress = readJSON(PROGRESS_FILE);

    if (!progress[email]) {
        progress[email] = { word: 0, excel: 0, ppt: 0 };
    }

    progress[email] = {
        word: word ?? progress[email].word,
        excel: excel ?? progress[email].excel,
        ppt: ppt ?? progress[email].ppt
    };

    writeJSON(PROGRESS_FILE, progress);
    res.json({ success: true, message: 'Progress updated' });
});

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
