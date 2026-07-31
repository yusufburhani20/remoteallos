const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');

const config = require('./config');
const { setupAgentHandlers } = require('./socket/agentHandler');
const { setupAdminHandlers } = require('./socket/adminHandler');
const { setupVncProxy } = require('./vnc-proxy/proxy');
const apiRoutes = require('./routes/api');

const fs = require('fs');

// 🔌 App Setup 🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌🔌
const app = express();

let server;
const keyPath = path.join(__dirname, 'server.key');
const certPath = path.join(__dirname, 'server.cert');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const https = require('https');
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  server = https.createServer(options, app);
  console.log('🔒 SSL Certificates found. Starting in HTTPS mode.');
} else {
  server = http.createServer(app);
  console.log('🔓 No SSL Certificates found. Starting in HTTP mode.');
}

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 20 * 1024 * 1024, // 20MB (for screenshots)
});

// ─── Session ──────────────────────────────────────────────────────────────────
const sessionMiddleware = session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24h
});

app.use(sessionMiddleware);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static Assets ────────────────────────────────────────────────────────────
// Serve dashboard CSS, JS, images
app.use('/assets', express.static(path.join(__dirname, '../dashboard')));
// Serve agent installer & client files
app.use('/agent', express.static(path.join(__dirname, '../agent')));

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/login.html'));
});

app.post('/login', (req, res) => {
  if (req.body.password === config.ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/dashboard');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/main.html'));
});

app.use('/api', requireAuth, apiRoutes);

// ─── Socket.IO Namespaces ─────────────────────────────────────────────────────
const agentIO = io.of('/agent');   // Lab PC agents connect here
const adminIO = io.of('/admin');   // Admin dashboard connects here

setupAgentHandlers(agentIO, adminIO);
setupAdminHandlers(adminIO, agentIO);

// ─── VNC Proxy ────────────────────────────────────────────────────────────────
setupVncProxy(server);

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(config.PORT, '0.0.0.0', () => {
  const divider = '═'.repeat(44);
  console.log(`\n╔${divider}╗`);
  console.log(`║         🖥️  Lab Remote Manager              ║`);
  console.log(`╚${divider}╝`);
  console.log(`\n  📡 Lokal   : http://localhost:${config.PORT}`);
  console.log(`  🌐 Online  : Aktifkan Cloudflare Tunnel`);
  console.log(`  🔑 Password: ${config.ADMIN_PASSWORD}`);
  console.log(`\n  Menunggu agent terhubung...\n`);
});
