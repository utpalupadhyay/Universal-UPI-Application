// backend/server.js
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

const config = require('./config');
const apiRoutes = require('./routes/api');
const paymentOrchestrator = require('./services/paymentOrchestrator');

const app = express();
const server = http.createServer(app);

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json());

// Serve static frontend files from project root
const publicPath = path.join(__dirname, '..');
app.use(express.static(publicPath));

// API Routes
app.use('/api/v1', apiRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    system: 'Universal UPI & Universal Payment Gateway',
    timestamp: new Date().toISOString()
  });
});

// Setup WebSocket Server for Real-Time Payment Routing Events
const wss = new WebSocketServer({ server, path: '/ws' });

const broadcast = (data) => {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Connect payment orchestrator broadcast to WebSocket clients
paymentOrchestrator.setWebSocketBroadcaster(broadcast);

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: 'Connected to Universal UPI Real-Time Gateway'
  }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {}
  });
});

// Start Server
server.listen(config.PORT, () => {
  console.log('========================================================');
  console.log(`🚀 Universal UPI Backend running on http://localhost:${config.PORT}`);
  console.log(`📡 WebSocket Gateway available on ws://localhost:${config.PORT}/ws`);
  console.log(`🌐 Serving UI at http://localhost:${config.PORT}`);
  console.log('========================================================');
});

module.exports = { app, server };
