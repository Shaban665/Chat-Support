
import express from 'express';

import {
    startConversation,
    startAgentConversation,
    getAgentConversations,
} from '../controllers/chatController.js';

import {
    getMessages,
    getVisitorMessages,
} from '../controllers/messageController.js';

import protect from '../middleware/authMiddleware.js';

const router = express.Router();

// Visitor: Start or get conversation
router.post('/conversation', startConversation);

// Visitor: Get own conversation messages
router.post('/visitor/messages', getVisitorMessages);

// Agent: Start or get visitor conversation
router.post('/agent/conversation', protect, startAgentConversation);

// Agent: Get all open conversations
router.get('/conversations', protect, getAgentConversations);

// Agent: Get conversation messages
router.get('/:conversationId/messages', protect, getMessages);

export default router;
