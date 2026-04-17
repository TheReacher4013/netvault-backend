const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
require('dotenv').config();

const connectDB = require('./config/db');
const logger = require('./utils/logger');
const errorMiddleware = require('./middleware/error.middleware');
// ✅ FIX (Bug #2): Import the singleton BEFORE the jobs that need it
const { setIO } = require('./utils/socket');

// Route imports
const authRoutes = require('./routes/auth.routes');
const domainRoutes = require('./routes/domain.routes');
const hostingRoutes = require('./routes/hosting.routes');
const clientRoutes = require('./routes/client.routes');
const billingRoutes = require('./routes/billing.routes');
const notificationRoutes = require('./routes/notification.routes');
const reportRoutes = require('./routes/report.routes');
const userRoutes = require('./routes/user.routes');
const uptimeRoutes = require('./routes/uptime.routes');
const superAdminRoutes = require('./routes/superadmin.routes');
const tenantRoutes = require('./routes/tenant.routes');


const app = express();
const server = http.createServer(app);

// Socket.io setup
// const io = new Server(server, {
//   cors: {
//     origin: process.env.FRONTEND_URL || 'http://localhost:5173',
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
// });

const io = new Server(server, {
  cors: {
    origin: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ✅ FIX (Bug #2): Register io in singleton BEFORE requiring cron jobs
// This ensures uptimeChecker.js can safely call getIO() at emit time
// without a circular dependency.
setIO(io);
app.set('io', io);

// ── Now safe to start cron jobs (they use getIO(), not require('./server')) ──
require('./jobs/expiryChecker');
require('./jobs/uptimeChecker');

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join-tenant', (tenantId) => {
    socket.join(`tenant-${tenantId}`);
    logger.info(`Socket ${socket.id} joined tenant-${tenantId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Connect to DB
connectDB();

// Security middleware
app.use(helmet());

// CORS — strip trailing slash, support multiple origins
const allowedOrigins = [
  (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const clean = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(clean)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
}));

app.options('*', cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/uploads', express.static('uploads'));

// ── Routes ──
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/hosting', hostingRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/uptime', uptimeRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/tenant', tenantRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'NetVault API running', timestamp: new Date() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`NetVault server running on port ${PORT} [${process.env.NODE_ENV}]`);
});

module.exports = { app, io };
