
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Notification from '../models/Notification.js';

const REMINDER_INTERVAL = 5 * 60 * 1000;
const CHECK_INTERVAL = 60 * 1000;

export const startUnreadReminderScheduler = (io) => {
    let isRunning = false;

    const checkUnreadConversations = async () => {
        if (isRunning) return;

        isRunning = true;

        try {
            const unreadConversations = await Message.aggregate([
                {
                    $match: {
                        senderType: 'visitor',
                        isRead: false,
                    },
                },
                {
                    $group: {
                        _id: '$conversation',
                        unreadCount: { $sum: 1 },
                        latestUnreadAt: { $max: '$createdAt' },
                    },
                },
            ]);

            if (!unreadConversations.length) return;

            const conversationIds = unreadConversations.map(
                (item) => item._id
            );

            const conversations = await Conversation.find({
                _id: { $in: conversationIds },
                status: 'open',
            })
                .populate('widget', 'name owner')
                .populate('visitor', 'name email');

            const unreadMap = new Map(
                unreadConversations.map((item) => [
                    item._id.toString(),
                    item,
                ])
            );

            const now = new Date();

            for (const conversation of conversations) {
                const unreadData = unreadMap.get(
                    conversation._id.toString()
                );

                if (!unreadData || !conversation.widget?.owner) {
                    continue;
                }

                const lastReminderAt =
                    conversation.lastUnreadReminderAt ||
                    unreadData.latestUnreadAt;

                const nextReminderAt =
                    new Date(lastReminderAt).getTime() +
                    REMINDER_INTERVAL;

                if (now.getTime() < nextReminderAt) {
                    continue;
                }

                // Claim this reminder to prevent duplicate processing
                const reminderClaim = await Conversation.updateOne(
                    {
                        _id: conversation._id,
                        lastUnreadReminderAt:
                            conversation.lastUnreadReminderAt,
                    },
                    {
                        $set: {
                            lastUnreadReminderAt: now,
                        },
                    }
                );

                if (reminderClaim.modifiedCount !== 1) {
                    continue;
                }

                const visitorName =
                    conversation.visitor?.name || 'A visitor';

                try {
                    const notification = await Notification.create({
                        recipient: conversation.widget.owner,
                        widget: conversation.widget._id,
                        conversation: conversation._id,
                        visitor: conversation.visitor._id,
                        type: 'unread_reminder',
                        title: 'Unread Message Reminder',
                        message:
                            `${visitorName} has ` +
                            `${unreadData.unreadCount} unread visitor message(s).`,
                    });

                    io.to(
                        `agent:${conversation.widget.owner.toString()}`
                    ).emit('agent_notification', {
                        _id: notification._id,
                        type: notification.type,
                        title: notification.title,
                        message: notification.message,
                        widget: {
                            _id: conversation.widget._id,
                            name: conversation.widget.name,
                        },
                        conversation: conversation._id,
                        visitor: {
                            _id: conversation.visitor._id,
                            name: visitorName,
                            email: conversation.visitor.email || '',
                        },
                        unreadCount: unreadData.unreadCount,
                        isRead: notification.isRead,
                        createdAt: notification.createdAt,
                    });

                    console.log(
                        `Unread reminder sent for conversation: ${conversation._id}`
                    );
                } catch (notificationError) {
                    // Allow retry if notification creation fails
                    await Conversation.updateOne(
                        {
                            _id: conversation._id,
                            lastUnreadReminderAt: now,
                        },
                        {
                            $set: {
                                lastUnreadReminderAt:
                                    conversation.lastUnreadReminderAt,
                            },
                        }
                    );

                    console.error(
                        'Unread Reminder Notification Error:',
                        notificationError
                    );
                }
            }
        } catch (error) {
            console.error('Unread Reminder Scheduler Error:', error);
        } finally {
            isRunning = false;
        }
    };

    // Check existing unread conversations on startup
    checkUnreadConversations();

    // Check every minute; actual reminders remain 5 minutes apart
    const interval = setInterval(
        checkUnreadConversations,
        CHECK_INTERVAL
    );

    console.log('Unread reminder scheduler started');

    return interval;
};
