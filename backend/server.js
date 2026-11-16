
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';

import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import widgetRoutes from './routes/widgetRoutes.js';
import visitorRoutes from './routes/visitorRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import pushRoutes from './routes/pushRoutes.js';

import initializeChatSockets from './sockets/chatSocket.js';
import { startUnreadReminderScheduler } from './services/unreadReminderService.js';

dotenv.config();

const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Security middleware
app.use(helmet());

// Allowed frontend origins
const allowedOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

// CORS configuration
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests without an Origin header
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(
            new Error(`CORS blocked for origin: ${origin}`)
        );
    },
    credentials: true,
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Socket.IO configuration
const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST'],
    },
});

// Initialize chat sockets
initializeChatSockets(io);

// Make Socket.IO accessible inside controllers
app.set('io', io);

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Bulk Chat API is running',
        environment: process.env.NODE_ENV,
    });
});

// Widget test
app.post('/api/widgets/test', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Widget route is working',
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/widgets', widgetRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushRoutes);

// Connect database and start server
const PORT = process.env.PORT || 5000;

connectDB()
    .then(() => {
        httpServer.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log('Socket.IO server is ready');
            console.log('Allowed CORS origins:', allowedOrigins);

            // Start unread reminder scheduler
            startUnreadReminderScheduler(io);
        });
    })
    .catch((error) => {
        console.error('Database connection failed:', error);
        process.exit(1);
    });
