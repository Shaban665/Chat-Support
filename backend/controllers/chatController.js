
import mongoose from 'mongoose';

import Widget from '../models/Widget.js';
import Visitor from '../models/Visitor.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';

import { isAllowedOrigin } from '../utils/domainUtils.js';
import { sendPushToUser } from '../services/pushNotificationService.js';

// @desc Start or get visitor conversation
// @route POST /api/chat/conversation
// @access Public (Visitor)




export const startConversation = async (req, res) => {
    try {
        const {
            publicKey,
            visitorId,
            name,
            email,
            parentOrigin,
        } = req.body;

        // Validate common required fields
        if (
            typeof publicKey !== 'string' ||
            !publicKey.trim() ||
            typeof visitorId !== 'string' ||
            !visitorId.trim() ||
            typeof parentOrigin !== 'string' ||
            !parentOrigin.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: 'Public key, visitor ID and parent origin are required',
            });
        }

        if (visitorId.trim().length > 128) {
            return res.status(400).json({
                success: false,
                message: 'Invalid visitor ID',
            });
        }

        // Find active widget
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

        // Verify parent website domain
        if (!isAllowedOrigin(widget, parentOrigin)) {
            return res.status(403).json({
                success: false,
                message: 'This website domain is not allowed',
            });
        }

        // Find visitor belonging to this widget
        const visitor = await Visitor.findOne({
            widget: widget._id,
            visitorId: visitorId.trim(),
        });

        if (!visitor) {
            return res.status(404).json({
                success: false,
                message: 'Visitor not found. Track visitor first.',
            });
        }

        // Check whether visitor is submitting details for the first time
        const isFirstProfileSubmission = !visitor.name && !visitor.email;

        // Handle incomplete visitor profile
        if (!visitor.name || !visitor.email) {
            // Initial widget load: ask frontend to show profile form
            if (
                typeof name !== 'string' ||
                typeof email !== 'string'
            ) {
                return res.status(200).json({
                    success: true,
                    needsProfile: true,
                    message: 'Please submit your details to start chatting',
                    visitor: {
                        _id: visitor._id,
                        visitorId: visitor.visitorId,
                        name: visitor.name || '',
                        email: visitor.email || '',
                    },
                    conversation: null,
                    welcomeMessage: null,
                    isNewConversation: false,
                });
            }

            const visitorName = name.trim();
            const visitorEmail = email.trim().toLowerCase();

            if (visitorName.length < 2 || visitorName.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Name must be between 2 and 100 characters',
                });
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(visitorEmail)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid email address',
                });
            }

            visitor.name = visitorName;
            visitor.email = visitorEmail;

            await visitor.save();
        }

        const now = new Date();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

        // Find latest open conversation for this visitor and widget
        let conversation = await Conversation.findOne({
            widget: widget._id,
            visitor: visitor._id,
            status: 'open',
        }).sort({
            lastActivityAt: -1,
            lastMessageAt: -1,
            createdAt: -1,
        });

        let isNewConversation = false;
        let welcomeMessage = null;

        if (conversation) {
            // Fallback for older conversations without lastActivityAt
            const lastActivity =
                conversation.lastActivityAt ||
                conversation.lastMessageAt ||
                conversation.createdAt;

            const inactiveTime =
                now.getTime() - new Date(lastActivity).getTime();

            if (inactiveTime >= TWENTY_FOUR_HOURS) {
                // Close expired conversation without deleting messages
                conversation.status = 'closed';
                await conversation.save();

                conversation = null;
            }
        }

        if (!conversation) {
            // Create new conversation after expiry or first visit
            conversation = await Conversation.create({
                widget: widget._id,
                visitor: visitor._id,
                status: 'open',
                lastActivityAt: now,
            });

            isNewConversation = true;
        } else {
            // Resume existing conversation
            conversation.lastActivityAt = now;
            await conversation.save();
        }

        // Create welcome message only for a new conversation
        if (isNewConversation) {
            welcomeMessage = await Message.create({
                conversation: conversation._id,
                senderType: 'agent',
                sender: null,
                content: 'Hey! 👋 Welcome! How can I help you today?',
                isRead: true,
            });

            conversation.lastMessage = welcomeMessage.content;
            conversation.lastMessageAt = welcomeMessage.createdAt;
            conversation.lastActivityAt = now;

            await conversation.save();
        }

        // Create notification for first-time visitor details submission
        if (isFirstProfileSubmission) {
            const notification = await Notification.create({
                recipient: widget.owner,
                widget: widget._id,
                conversation: conversation._id,
                visitor: visitor._id,
                type: 'new_visitor',
                title: 'New Visitor',
                message: `${visitor.name} started a conversation.`,
            });

            sendPushToUser(widget.owner, {
                title: notification.title,
                body: notification.message,
                notificationId: notification._id.toString(),
                conversationId: conversation._id.toString(),
                url: '/agent/inbox',
            }).catch((error) => {
                console.error('New Visitor Push Error:', error.message);
            });

            const io = req.app.get('io');

            if (io && widget.owner) {
                io.to(`agent:${widget.owner.toString()}`).emit(
                    'agent_notification',
                    {
                        _id: notification._id,
                        type: notification.type,
                        title: notification.title,
                        message: notification.message,
                        widget: {
                            _id: widget._id,
                            name: widget.name,
                        },
                        conversation: conversation._id,
                        visitor: {
                            _id: visitor._id,
                            name: visitor.name,
                            email: visitor.email,
                        },
                        isRead: notification.isRead,
                        createdAt: notification.createdAt,
                    }
                );
            }
        }

        // Notify widget owner about new conversation
        if (isNewConversation) {
            const io = req.app.get('io');

            if (io && widget.owner) {
                const populatedConversation = await Conversation.findById(
                    conversation._id
                )
                    .populate('visitor', 'name email visitorId isOnline')
                    .populate('widget', 'name');

                io.to(`agent:${widget.owner.toString()}`).emit(
                    'new_conversation',
                    populatedConversation
                );
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Conversation ready',
            visitor: {
                _id: visitor._id,
                visitorId: visitor.visitorId,
                name: visitor.name,
                email: visitor.email,
            },
            conversation,
            welcomeMessage,
            isNewConversation,
        });

    } catch (error) {
        console.error('Start Conversation Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to start conversation',
        });
    }
};





// @desc Start or get a conversation from Agent Visitors page
// @route POST /api/chat/agent/conversation
// @access Private (Agent)

export const startAgentConversation = async (req, res) => {
    try {
        const { visitorDbId } = req.body;

        if (!visitorDbId || !mongoose.Types.ObjectId.isValid(visitorDbId)) {
            return res.status(400).json({
                success: false,
                message: 'A valid visitor ID is required',
            });
        }

        const visitor = await Visitor.findById(visitorDbId)
            .populate('widget', 'owner name');

        if (!visitor || !visitor.widget) {
            return res.status(404).json({
                success: false,
                message: 'Visitor not found',
            });
        }

        // Ensure visitor belongs to logged-in agent
        if (
            visitor.widget.owner.toString() !== req.user._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to access this visitor',
            });
        }

        let conversation = await Conversation.findOne({
            widget: visitor.widget._id,
            visitor: visitor._id,
            status: 'open',
        });

        let isNewConversation = false;

        if (!conversation) {
            conversation = await Conversation.create({
                widget: visitor.widget._id,
                visitor: visitor._id,
                status: 'open',
            });

            isNewConversation = true;
        }

        conversation = await Conversation.findById(conversation._id)
            .populate('visitor', 'name email visitorId isOnline lastSeen')
            .populate('widget', 'name');

        if (isNewConversation) {
            const io = req.app.get('io');

            if (io) {
                io.to(`agent:${req.user._id.toString()}`).emit(
                    'new_conversation',
                    conversation
                );
            }
        }

        return res.status(200).json({
            success: true,
            message: isNewConversation
                ? 'Conversation created successfully'
                : 'Existing conversation opened',
            isNewConversation,
            conversation,
        });

    } catch (error) {
        console.error('Start Agent Conversation Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to start conversation',
        });
    }
};


// @desc Get all open conversations belonging to logged-in agent
// @route GET /api/chat/conversations
// @access Private (Agent)

export const getAgentConversations = async (req, res) => {
    try {
        const widgetIds = await Widget.find({
            owner: req.user._id,
        }).distinct('_id');

        const conversations = await Conversation.find({
            widget: { $in: widgetIds },
            status: 'open',
        })
            .populate('visitor', 'name email visitorId isOnline')
            .populate('widget', 'name')
            .sort({ lastMessageAt: -1, createdAt: -1 })
            .lean();

        const unreadCounts = await Message.aggregate([
            {
                $match: {
                    conversation: {
                        $in: conversations.map((item) => item._id),
                    },
                    senderType: 'visitor',
                    isRead: false,
                },
            },
            {
                $group: {
                    _id: '$conversation',
                    count: { $sum: 1 },
                },
            },
        ]);

        const unreadMap = new Map(
            unreadCounts.map((item) => [
                item._id.toString(),
                item.count,
            ])
        );

        const conversationsWithUnread = conversations.map((item) => ({
            ...item,
            unreadCount: unreadMap.get(item._id.toString()) || 0,
        }));

        return res.status(200).json({
            success: true,
            count: conversationsWithUnread.length,
            conversations: conversationsWithUnread,
        });

    } catch (error) {
        console.error('Get Agent Conversations Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch conversations',
        });
    }
};
