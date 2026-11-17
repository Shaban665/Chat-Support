
import mongoose from 'mongoose';

import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Widget from '../models/Widget.js';
import Visitor from '../models/Visitor.js';

import { isAllowedOrigin } from '../utils/domainUtils.js';

// @desc Get conversation messages and mark visitor messages as read
// @route GET /api/chat/:conversationId/messages
// @access Private (Agent)

export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;

        if (!mongoose.isValidObjectId(conversationId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid conversation ID',
            });
        }

        const widgetIds = await Widget.find({
            owner: req.user._id,
        }).distinct('_id');

        const conversation = await Conversation.findOne({
            _id: conversationId,
            widget: { $in: widgetIds },
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found',
            });
        }

        // Mark only visitor messages as read
        await Message.updateMany(
            {
                conversation: conversationId,
                senderType: 'visitor',
                isRead: false,
            },
            {
                $set: { isRead: true },
            }
        );

        // Reset reminder timer after visitor messages are read
        await Conversation.updateOne(
            { _id: conversationId },
            {
                $set: {
                    lastUnreadReminderAt: null,
                },
            }
        );

        const messages = await Message.find({
            conversation: conversationId,
        }).sort({ createdAt: 1 });

        return res.status(200).json({
            success: true,
            count: messages.length,
            messages,
        });

    } catch (error) {
        console.error('Get Messages Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch messages',
        });
    }
};


// @desc Get messages for a verified website visitor
// @route POST /api/chat/visitor/messages
// @access Public (Verified Visitor)

export const getVisitorMessages = async (req, res) => {
    try {
        const {
            publicKey,
            visitorId,
            parentOrigin,
            conversationId,
        } = req.body;

        // Validate request data
        if (
            typeof publicKey !== 'string' ||
            !publicKey.trim() ||
            typeof visitorId !== 'string' ||
            !visitorId.trim() ||
            typeof parentOrigin !== 'string' ||
            !parentOrigin.trim() ||
            typeof conversationId !== 'string' ||
            !mongoose.isValidObjectId(conversationId)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid visitor message request',
            });
        }

        // Verify active widget
        const widget = await Widget.findOne({
            publicKey: publicKey.trim(),
            isActive: true,
        });

        if (!widget) {
            return res.status(404).json({
                success: false,
                message: 'Widget not found or inactive',
            });
        }

        // Verify website domain
        if (!isAllowedOrigin(widget, parentOrigin)) {
            return res.status(403).json({
                success: false,
                message: 'This website domain is not allowed',
            });
        }

        // Verify visitor belongs to this widget
        const visitor = await Visitor.findOne({
            widget: widget._id,
            visitorId: visitorId.trim(),
        });

        if (!visitor) {
            return res.status(404).json({
                success: false,
                message: 'Visitor not found',
            });
        }

        // Verify conversation belongs to this exact visitor and widget
        const conversation = await Conversation.findOne({
            _id: conversationId,
            widget: widget._id,
            visitor: visitor._id,
            status: 'open',
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Active conversation not found',
            });
        }

        // Fetch conversation history without changing agent read status
        const messages = await Message.find({
            conversation: conversation._id,
        }).sort({ createdAt: 1 });

        return res.status(200).json({
            success: true,
            count: messages.length,
            messages,
        });

    } catch (error) {
        console.error('Get Visitor Messages Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch visitor messages',
        });
    }
};
