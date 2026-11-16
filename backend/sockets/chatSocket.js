
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import User from '../models/User.js';
import Widget from '../models/Widget.js';
import Visitor from '../models/Visitor.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Notification from '../models/Notification.js';
import { sendPushToUser } from '../services/pushNotificationService.js';

import {
    isAllowedOrigin,
    isPageUrlFromOrigin,
} from '../utils/domainUtils.js';

const initializeChatSockets = (io) => {
    const visitorSocketMap = new Map();

    const getVisitorKey = (widgetId, visitorDbId) => {
        return `${widgetId}:${visitorDbId}`;
    };

    const emitVisitorStatus = (widget, visitor, isOnline) => {
        if (!widget?.owner) return;

        io.to(`agent:${widget.owner.toString()}`).emit('visitor_status', {
            widgetId: widget._id.toString(),
            visitorId: visitor.visitorId,
            visitorDbId: visitor._id.toString(),
            isOnline,
            lastSeen: visitor.lastSeen || new Date(),
        });
    };

    // Verify conversation ownership and access
    const getAuthorizedConversation = async (socket, conversationId) => {
        if (!mongoose.isValidObjectId(conversationId)) {
            console.log('Invalid conversation ID:', conversationId);
            return null;
        }

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            console.log('Conversation does not exist:', conversationId);
            return null;
        }

        if (conversation.status !== 'open') {
            console.log('Conversation is closed:', conversationId);
            return null;
        }

        // Visitor can only access their own conversation
        if (socket.role === 'visitor') {
            const isSameWidget =
                conversation.widget.toString() === socket.widget._id.toString();

            const isSameVisitor =
                conversation.visitor.toString() === socket.visitor._id.toString();

            if (!isSameWidget || !isSameVisitor) {
                console.log('Visitor conversation authorization failed:', {
                    conversationId,
                    conversationWidget: conversation.widget.toString(),
                    socketWidget: socket.widget._id.toString(),
                    conversationVisitor: conversation.visitor.toString(),
                    socketVisitor: socket.visitor._id.toString(),
                });

                return null;
            }

            return conversation;
        }

        // Agent can only access conversations belonging to their widgets
        if (socket.role === 'agent') {
            const ownsWidget = await Widget.exists({
                _id: conversation.widget,
                owner: socket.user._id,
            });

            if (!ownsWidget) {
                console.log('Agent does not own conversation widget:', {
                    agentId: socket.user._id.toString(),
                    conversationId,
                });

                return null;
            }

            return conversation;
        }

        return null;
    };

    // SOCKET AUTHENTICATION
    io.use(async (socket, next) => {
        try {
            const auth = socket.handshake.auth || {};

            // VISITOR AUTHENTICATION
            if (auth.role === 'visitor') {
                const {
                    publicKey,
                    visitorId,
                    parentOrigin,
                    currentPage,
                } = auth;

                if (
                    typeof publicKey !== 'string' ||
                    !publicKey.trim() ||
                    typeof visitorId !== 'string' ||
                    !visitorId.trim() ||
                    typeof parentOrigin !== 'string' ||
                    typeof currentPage !== 'string'
                ) {
                    return next(
                        new Error(
                            'Public key, visitor ID and website information are required'
                        )
                    );
                }

                // Find active widget
                const widget = await Widget.findOne({
                    publicKey,
                    isActive: true,
                });

                if (!widget) {
                    return next(new Error('Widget not found or inactive'));
                }

                // Verify parent website domain
                if (!isAllowedOrigin(widget, parentOrigin)) {
                    return next(
                        new Error('Website domain is not allowed')
                    );
                }

                // Verify current page belongs to parent website
                if (!isPageUrlFromOrigin(currentPage, parentOrigin)) {
                    return next(
                        new Error('Invalid website page URL or origin mismatch')
                    );
                }

                // Find visitor belonging to this widget
                const visitor = await Visitor.findOne({
                    widget: widget._id,
                    visitorId: visitorId.trim(),
                });

                if (!visitor) {
                    return next(
                        new Error('Visitor not found. Track visitor first.')
                    );
                }

                socket.role = 'visitor';
                socket.widget = widget;
                socket.visitor = visitor;
                socket.parentOrigin = parentOrigin;
                socket.currentPage = currentPage;

                return next();
            }

            // AGENT AUTHENTICATION
            if (auth.role && auth.role !== 'agent') {
                return next(new Error('Invalid socket role'));
            }

            const cookieHeader = socket.handshake.headers.cookie || '';

            const cookies = Object.fromEntries(
                cookieHeader.split(';').filter(Boolean).map(cookie => {
                    const [key, ...value] = cookie.trim().split('=');

                    return [
                        key,
                        decodeURIComponent(value.join('=')),
                    ];
                })
            );

            const token = cookies.bulkchat_token;

            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const user = await User.findById(decoded.id).select('-password');

            if (!user || !user.isActive) {
                return next(new Error('Invalid or inactive agent'));
            }

            socket.role = 'agent';
            socket.user = user;

            return next();

        } catch (error) {
            console.error('Socket Authentication Error:', error);
            return next(new Error('Socket authentication failed'));
        }
    });

    // SOCKET CONNECTION
    // IMPORTANT: Keep this handler synchronous.
    io.on('connection', (socket) => {

        if (socket.role === 'agent') {
            console.log(`Agent connected: ${socket.user._id}`);

            socket.join(`agent:${socket.user._id}`);

        } else {
            console.log(`Visitor connected: ${socket.visitor.visitorId}`);

            const visitorKey = getVisitorKey(
                socket.widget._id,
                socket.visitor._id
            );

            if (!visitorSocketMap.has(visitorKey)) {
                visitorSocketMap.set(visitorKey, new Set());
            }

            visitorSocketMap.get(visitorKey).add(socket.id);

            // Update visitor online status in background.
            // Do not await here, otherwise event listeners may register late.
            (async () => {
                try {
                    const visitor = await Visitor.findByIdAndUpdate(
                        socket.visitor._id,
                        {
                            isOnline: true,
                            lastSeen: new Date(),
                        },
                        { returnDocument: 'after' }
                    );

                    if (visitor) {
                        socket.visitor = visitor;
                        emitVisitorStatus(socket.widget, visitor, true);
                    }
                } catch (error) {
                    console.error('Visitor Online Update Error:', error);
                }
            })();
        }

        // JOIN CONVERSATION
        socket.on('join_conversation', async (data, callback) => {
            try {
                const { conversationId } = data || {};

                console.log(
                    `${socket.role} requested conversation join:`,
                    conversationId
                );

                const conversation = await getAuthorizedConversation(
                    socket,
                    conversationId
                );

                if (!conversation) {
                    return callback?.({
                        success: false,
                        message: 'Conversation not found, closed, or access denied',
                    });
                }

                const room = `conversation:${conversation._id}`;

                await socket.join(room);

                console.log(
                    `${socket.role} joined conversation: ${conversation._id}`
                );

                return callback?.({
                    success: true,
                    message: 'Joined conversation successfully',
                });

            } catch (error) {
                console.error('Join Conversation Error:', error);

                return callback?.({
                    success: false,
                    message: 'Failed to join conversation',
                });
            }
        });

        // LEAVE CONVERSATION
        socket.on('leave_conversation', async (data) => {
            try {
                const { conversationId } = data || {};

                if (!mongoose.isValidObjectId(conversationId)) return;

                const room = `conversation:${conversationId}`;

                if (socket.rooms.has(room)) {
                    socket.to(room).emit('user_typing', {
                        conversationId: conversationId.toString(),
                        senderType: socket.role,
                        isTyping: false,
                    });

                    await socket.leave(room);
                }
            } catch (error) {
                console.error('Leave Conversation Error:', error);
            }
        });

        // TYPING START
        socket.on('typing_start', async (data) => {
            try {
                const { conversationId } = data || {};

                const conversation = await getAuthorizedConversation(
                    socket,
                    conversationId
                );

                if (!conversation) return;

                const room = `conversation:${conversationId}`;

                if (!socket.rooms.has(room)) return;

                socket.to(room).emit('user_typing', {
                    conversationId: conversationId.toString(),
                    senderType: socket.role,
                    isTyping: true,
                });

            } catch (error) {
                console.error('Typing Start Error:', error);
            }
        });

        // TYPING STOP
        socket.on('typing_stop', async (data) => {
            try {
                const { conversationId } = data || {};

                const conversation = await getAuthorizedConversation(
                    socket,
                    conversationId
                );

                if (!conversation) return;

                const room = `conversation:${conversationId}`;

                if (!socket.rooms.has(room)) return;

                socket.to(room).emit('user_typing', {
                    conversationId: conversationId.toString(),
                    senderType: socket.role,
                    isTyping: false,
                });

            } catch (error) {
                console.error('Typing Stop Error:', error);
            }
        });

        // SEND MESSAGE
        socket.on('send_message', async (data, callback) => {
            try {
                const { conversationId, content } = data || {};

                if (
                    !mongoose.isValidObjectId(conversationId) ||
                    typeof content !== 'string' ||
                    !content.trim() ||
                    content.trim().length > 5000
                ) {
                    return callback?.({
                        success: false,
                        message: 'Valid conversation ID and message are required',
                    });
                }

                const conversation = await getAuthorizedConversation(
                    socket,
                    conversationId
                );

                if (!conversation) {
                    return callback?.({
                        success: false,
                        message: 'Conversation not found, closed, or access denied',
                    });
                }

                // Save message
                const message = await Message.create({
                    conversation: conversation._id,
                    senderType: socket.role,
                    sender: socket.role === 'agent'
                        ? socket.user._id
                        : socket.visitor._id,
                    content: content.trim(),
                });

                conversation.lastMessage = message.content;
                conversation.lastMessageAt = message.createdAt;

                await conversation.save();

                const room = `conversation:${conversationId}`;

                // Stop typing indicator after sending
                io.to(room).emit('user_typing', {
                    conversationId: conversationId.toString(),
                    senderType: socket.role,
                    isTyping: false,
                });

                // Deliver message to active conversation participants
                io.to(room).emit('new_message', message);

                // Create persistent notification for visitor messages only
                if (socket.role === 'visitor' && socket.widget.owner) {
                    try {
                        const visitor = await Visitor.findById(
                            socket.visitor._id
                        ).select('name email');

                        const visitorName = visitor?.name || 'A visitor';

                        const notification = await Notification.create({
                            recipient: socket.widget.owner,
                            widget: socket.widget._id,
                            conversation: conversation._id,
                            visitor: socket.visitor._id,
                            type: 'new_message',
                            title: 'New Message',
                            message: `${visitorName}: ${message.content.slice(0, 100)}`,
                        });
                        // Send mobile push notification
sendPushToUser(socket.widget.owner, {
    title: notification.title,
    body: notification.message,
    notificationId: notification._id.toString(),
    conversationId: conversation._id.toString(),
    url: '/agent/inbox',
}).catch((error) => {
    console.error('Mobile Push Error:', error.message);
});

                        // Notify connected agent in real time
                        io.to(`agent:${socket.widget.owner.toString()}`).emit(
                            'agent_notification',
                            {
                                _id: notification._id,
                                type: notification.type,
                                title: notification.title,
                                message: notification.message,
                                widget: {
                                    _id: socket.widget._id,
                                    name: socket.widget.name,
                                },
                                conversation: conversation._id,
                                visitor: {
                                    _id: socket.visitor._id,
                                    name: visitorName,
                                    email: visitor?.email || '',
                                },
                                isRead: notification.isRead,
                                createdAt: notification.createdAt,
                            }
                        );

                    } catch (notificationError) {
                        // Do not fail message delivery if notification fails
                        console.error(
                            'Visitor Message Notification Error:',
                            notificationError
                        );
                    }

                    // Preserve existing inbox event
                    io.to(`agent:${socket.widget.owner.toString()}`).emit(
                        'inbox_new_message',
                        message
                    );
                }

                console.log('Message saved successfully:', {
                    conversationId: conversationId.toString(),
                    senderType: socket.role,
                    messageId: message._id.toString(),
                });

                return callback?.({
                    success: true,
                    message: 'Message sent successfully',
                    data: message,
                });

            } catch (error) {
                console.error('Send Message Error:', error);

                return callback?.({
                    success: false,
                    message: 'Failed to send message',
                });
            }
        });

        // DISCONNECTING
        socket.on('disconnecting', () => {
            for (const room of socket.rooms) {
                if (room.startsWith('conversation:')) {
                    const conversationId = room.replace(
                        'conversation:',
                        ''
                    );

                    socket.to(room).emit('user_typing', {
                        conversationId,
                        senderType: socket.role,
                        isTyping: false,
                    });
                }
            }
        });

        // DISCONNECT
        socket.on('disconnect', async () => {
            if (socket.role === 'agent') {
                console.log(`Agent disconnected: ${socket.user._id}`);
                return;
            }

            const visitorKey = getVisitorKey(
                socket.widget._id,
                socket.visitor._id
            );

            const activeSockets = visitorSocketMap.get(visitorKey);

            if (activeSockets) {
                activeSockets.delete(socket.id);

                if (activeSockets.size > 0) {
                    return;
                }

                visitorSocketMap.delete(visitorKey);
            }

            try {
                const visitor = await Visitor.findByIdAndUpdate(
                    socket.visitor._id,
                    {
                        isOnline: false,
                        lastSeen: new Date(),
                    },
                    { returnDocument: 'after' }
                );

                if (visitor) {
                    emitVisitorStatus(socket.widget, visitor, false);
                }
            } catch (error) {
                console.error('Visitor Offline Update Error:', error);
            }

            console.log(`Visitor disconnected: ${socket.visitor.visitorId}`);
        });
    });
};

export default initializeChatSockets;
