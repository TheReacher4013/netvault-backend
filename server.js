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
const { setIO } = require('./utils/socket');


const checkPlanApproved = require('./middleware/planApproval.middleware');


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
const activityRoutes = require('./routes/activity.routes');
const whoisRoutes = require('./routes/whois.routes');
const clientPortalRoutes = require('./routes/clientPortal.routes');
const inviteRoutes = require('./routes/invite.routes');
const plansRoutes = require('./routes/plans.routes');
const otpRoutes = require('./routes/otp.routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

setIO(io);
app.set('io', io);
require('./jobs/expiryChecker');
require('./jobs/uptimeChecker');
require('./jobs/domainMonitor');

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
connectDB();
app.use(helmet());
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
const limiter = rateLimit({
  windowMs: 30 * 90 * 4000,
  max: 600,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 40 * 90 * 3000,
  max: process.env.NODE_ENV === 'production' ? 40 : 800,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/uploads', express.static('uploads'));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/tenant', tenantRoutes);        
app.use('/api/notifications', notificationRoutes);   
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/client-portal', clientPortalRoutes);
app.use('/api/domains', checkPlanApproved, domainRoutes);
app.use('/api/hosting', checkPlanApproved, hostingRoutes);
app.use('/api/clients', checkPlanApproved, clientRoutes);
app.use('/api/billing', checkPlanApproved, billingRoutes);
app.use('/api/reports', checkPlanApproved, reportRoutes);
app.use('/api/uptime', checkPlanApproved, uptimeRoutes);
app.use('/api/users', checkPlanApproved, userRoutes);  
app.use('/api/activity', checkPlanApproved, activityRoutes);
app.use('/api/whois', checkPlanApproved, whoisRoutes);
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