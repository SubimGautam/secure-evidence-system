const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const env = require('./config/env');
const securityHeaders = require('./middleware/securityHeaders');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const evidenceRoutes = require('./modules/evidence/evidence.routes');
const custodyRoutes = require('./modules/custody/custody.routes');
const usersRoutes = require('./modules/users/users.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const adminRoutes = require('./modules/admin/admin.routes');

const app = express();

app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(apiLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

app.use('/api/v1', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/evidence', evidenceRoutes);
app.use('/api/v1', custodyRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1', auditRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
