require('dotenv').config(); // Make sure it's at the top
const express = require('express');
const cors = require('cors');
const fs = require('fs'); // for sync like existsSync
const fsp = require('fs/promises'); // for async like readFile/writeFile
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.static("public"));
app.use(express.json());
const { OpenAI } = require("openai");

// Securely load your OpenAI API key from .env
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// Files
const USERS_FILE = path.join(__dirname, 'users.json');
const PROGRESS_FILE = path.join(__dirname, 'progress.json');
const BLOCK_FILE = path.join(__dirname, 'blocked_ips.json');
const VISITS_FILE = path.join(__dirname, 'visits.json');

// Ensure visits file exists
if (!fs.existsSync(VISITS_FILE)) fs.writeFileSync(VISITS_FILE, "[]");

// In-memory cache
let usersCache = {};
let progressCache = {};
let blockedIPs = {};
let dirtyUsers = false;
let dirtyProgress = false;

// Load from file
const loadFile = async (file) => {
  try {
    const data = await fsp.readFile(file, 'utf8');
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

// Save to file
const saveFile = async (file, data) => {
  try {
    await fsp.writeFile(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error saving ${file}:`, err);
  }
};

// Initial load
(async () => {
  usersCache = await loadFile(USERS_FILE);
  progressCache = await loadFile(PROGRESS_FILE);
  blockedIPs = await loadFile(BLOCK_FILE);
})();

// Block logic
const isBlocked = (ip) => {
  const block = blockedIPs[ip];
  return block && new Date().getTime() < block;
};

const blockIP = (ip) => {
  blockedIPs[ip] = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
  saveFile(BLOCK_FILE, blockedIPs);
};

// Autosave every 5 seconds
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

// SIGN-UP
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

// LOGIN
app.post('/api/signin', (req, res) => {
  const { email, password } = req.body;
  const user = usersCache[email];

  if (!user || user.password !== password) {
    return res.json({ success: false, message: 'Invalid credentials' });
  }

  res.json({ success: true, message: 'Login successful', user });
});

// ADMIN VIEW USERS
const ADMIN_KEY = '12345adminkey';

app.get('/api/admin/users', (req, res) => {
  const { key } = req.query;
  if (key !== ADMIN_KEY) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const safeUsers = Object.values(usersCache).map(user => ({
    fullname: user.fullname,
    email: user.email,
    phone: user.phone,
    country: user.country,
    idcard: user.idcard
  }));

  res.json({ success: true, users: safeUsers });
});

// DELETE USER
app.delete('/api/admin/users/:email', (req, res) => {
  const { email } = req.params;
  const adminKey = req.query.key;

  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  if (!usersCache[email]) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  delete usersCache[email];
  delete progressCache[email];

  dirtyUsers = true;
  dirtyProgress = true;

  res.json({ success: true, message: 'Student deleted successfully' });
});

// ADMIN VERIFY
const ALLOWED_CODES = ['africa2025', 'adminKEY789', 'wizFranky2025'];

app.post('/api/verify-admin', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { code } = req.body;

  if (isBlocked(ip)) return res.status(403).send('Access blocked for 12 hours.');

  if (!ALLOWED_CODES.includes(code)) {
    blockIP(ip);
    await fsp.appendFile('admin_denied.log', `${ip} denied at ${new Date().toISOString()}\n`);
    return res.status(403).send('Access denied. You are blocked for 12 hours.');
  }

  return res.status(200).send('Verified');
});

// PROGRESS GET
app.get('/api/progress/:email', (req, res) => {
  const { email } = req.params;
  if (!progressCache[email]) return res.status(404).json({ error: 'Progress not found' });
  res.json(progressCache[email]);
});

// PROGRESS UPDATE
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

// TRACK VISIT
app.post('/api/track-visit', (req, res) => {
  const visit = {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.body.userAgent || "unknown",
    platform: req.body.platform || "unknown",
    screen: req.body.screen || "unknown",
  };

  const visits = JSON.parse(fs.readFileSync(VISITS_FILE));
  visits.push(visit);
  fs.writeFileSync(VISITS_FILE, JSON.stringify(visits, null, 2));

  res.json({ message: "Visit logged" });
});

// VISIT STATS
app.get('/api/stats', (req, res) => {
  const visits = JSON.parse(fs.readFileSync(VISITS_FILE));
  const today = new Date().toISOString().slice(0, 10);
  const todayVisits = visits.filter(v => v.timestamp.startsWith(today));

  res.json({
    total: visits.length,
    today: todayVisits.length,
    online: onlineUsers,
    recent: visits.slice(-10),
  });
});

// SOCKET.IO Online Users
let onlineUsers = 0;

io.on('connection', (socket) => {
  onlineUsers++;
  io.emit('userCount', onlineUsers);

  socket.on('disconnect', () => {
    onlineUsers--;
    io.emit('userCount', onlineUsers);
  });
});
app.post("/api/ai", async (req, res) => {
  const { message } = req.body;

  try {
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo", // Or "gpt-3.5-turbo" if you're on free plan
      messages: [
        { role: "system", content: "You are an AI assistant for Africa for Africa College." },
        { role: "user", content: message }
      ],
    });

    const reply = chatResponse.choices[0].message.content;
    res.json({ success: true, reply });
  } catch (err) {
    console.error("AI Error:", err);
    await fsp.appendFile("ai_logs.txt", `[${new Date().toISOString()}] ${message}\n`);
    res.status(500).json({ success: false, error: "Failed to get response from AI" });
  }
});


// START SERVER
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
