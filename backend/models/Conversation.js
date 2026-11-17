
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
    {
        widget: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Widget',
            required: true,
        },

        visitor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Visitor',
            required: true,
        },

        agent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },

        status: {
            type: String,
            enum: ['open', 'closed'],
            default: 'open',
        },

        lastMessage: {
            type: String,
            default: '',
        },

        lastMessageAt: {
            type: Date,
            default: null,
        },

        // Tracks the latest actual chat activity
        lastActivityAt: {
            type: Date,
            default: null,
        },

        // Tracks the last unread-message reminder
        lastUnreadReminderAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

conversationSchema.index({ widget: 1, visitor: 1, status: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
