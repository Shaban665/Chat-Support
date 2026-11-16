
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Widget from '../models/Widget.js';

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
