
import express from 'express';
import protect from '../middleware/authMiddleware.js';
import PushSubscription from '../models/PushSubscription.js';

const router = express.Router();

// All push subscription routes require agent authentication
router.use(protect);

// Save or update a device subscription
router.post('/subscribe', async (req, res) => {
    try {
        const { endpoint, keys, expirationTime } = req.body;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({
                success: false,
                message: 'Invalid push subscription.',
            });
        }

        const subscription = await PushSubscription.findOneAndUpdate(
            { endpoint },
            {
                $set: {
                    user: req.user._id,
                    endpoint,
                    keys: {
                        p256dh: keys.p256dh,
                        auth: keys.auth,
                    },
                    expirationTime: expirationTime ?? null,
                    userAgent: req.headers['user-agent'] || '',
                },
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }
        );

        return res.status(200).json({
            success: true,
            message: 'Push subscription saved successfully.',
        });
    } catch (error) {
        console.error('Push Subscribe Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to save push subscription.',
        });
    }
});

// Remove current device subscription
router.delete('/unsubscribe', async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({
                success: false,
                message: 'Subscription endpoint is required.',
            });
        }

        await PushSubscription.deleteOne({
            user: req.user._id,
            endpoint,
        });

        return res.status(200).json({
            success: true,
            message: 'Push subscription removed successfully.',
        });
    } catch (error) {
        console.error('Push Unsubscribe Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to remove push subscription.',
        });
    }
});

export default router;
