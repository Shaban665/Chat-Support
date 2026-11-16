
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

// @desc Get logged-in agent notifications
// @route GET /api/notifications
// @access Private (Agent)
export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({
            recipient: req.user._id,
        })
            .populate('widget', 'name')
            .populate('visitor', 'name email')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        const unreadCount = await Notification.countDocuments({
            recipient: req.user._id,
            isRead: false,
        });

        return res.status(200).json({
            success: true,
            count: notifications.length,
            unreadCount,
            notifications,
        });
    } catch (error) {
        console.error('Get Notifications Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications',
        });
    }
};

// @desc Get unread notification count
// @route GET /api/notifications/unread-count
// @access Private (Agent)
export const getUnreadCount = async (req, res) => {
    try {
        const unreadCount = await Notification.countDocuments({
            recipient: req.user._id,
            isRead: false,
        });

        return res.status(200).json({
            success: true,
            unreadCount,
        });
    } catch (error) {
        console.error('Get Unread Count Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch unread count',
        });
    }
};

// @desc Mark one notification as read
// @route PATCH /api/notifications/:id/read
// @access Private (Agent)
export const markNotificationAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid notification ID',
            });
        }

        const notification = await Notification.findOneAndUpdate(
            {
                _id: id,
                recipient: req.user._id,
            },
            {
                isRead: true,
                readAt: new Date(),
            },
            {
                new: true,
            }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Notification marked as read',
            notification,
        });
    } catch (error) {
        console.error('Mark Notification Read Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to update notification',
        });
    }
};

// @desc Mark all notifications as read
// @route PATCH /api/notifications/read-all
// @access Private (Agent)
export const markAllNotificationsAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            {
                recipient: req.user._id,
                isRead: false,
            },
            {
                isRead: true,
                readAt: new Date(),
            }
        );

        return res.status(200).json({
            success: true,
            message: 'All notifications marked as read',
        });
    } catch (error) {
        console.error('Mark All Notifications Read Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to update notifications',
        });
    }
};
