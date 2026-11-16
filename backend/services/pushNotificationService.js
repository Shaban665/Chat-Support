
import { createRequire } from 'node:module';
import PushSubscription from '../models/PushSubscription.js';

const require = createRequire(import.meta.url);
const webpush = require('web-push');

let vapidConfigured = false;

const configureWebPush = () => {
    if (vapidConfigured) return true;

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
        console.error(
            '[PUSH] VAPID configuration missing. Check Render environment variables.'
        );
        return false;
    }

    try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        vapidConfigured = true;

        console.log('[PUSH] VAPID configured successfully.');

        return true;
    } catch (error) {
        console.error('[PUSH] VAPID configuration failed:', error.message);
        return false;
    }
};

export const sendPushToUser = async (userId, payload) => {
    if (!configureWebPush()) return;

    try {
        console.log('[PUSH] Sending notification:', {
            userId: userId.toString(),
            title: payload.title,
        });

        const subscriptions = await PushSubscription.find({
            user: userId,
        });

        console.log('[PUSH] Subscriptions found:', subscriptions.length);

        if (!subscriptions.length) {
            console.warn('[PUSH] No subscriptions found for user:', userId);
            return;
        }

        const results = await Promise.allSettled(
            subscriptions.map(async (savedSubscription) => {
                const subscription = {
                    endpoint: savedSubscription.endpoint,
                    expirationTime: savedSubscription.expirationTime,
                    keys: savedSubscription.keys,
                };

                try {
                    const response = await webpush.sendNotification(
                        subscription,
                        JSON.stringify(payload)
                    );

                    console.log('[PUSH] Push accepted by push service:', {
                        subscriptionId: savedSubscription._id.toString(),
                        statusCode: response?.statusCode,
                    });

                    return true;
                } catch (error) {
                    console.error('[PUSH] Delivery failed:', {
                        subscriptionId: savedSubscription._id.toString(),
                        statusCode: error.statusCode,
                        message: error.message,
                        body: error.body,
                    });

                    if (
                        error.statusCode === 404 ||
                        error.statusCode === 410
                    ) {
                        await PushSubscription.deleteOne({
                            _id: savedSubscription._id,
                        });

                        console.warn('[PUSH] Expired subscription removed.');
                    }

                    throw error;
                }
            })
        );

        const successful = results.filter(
            result => result.status === 'fulfilled'
        ).length;

        const failed = results.length - successful;

        console.log('[PUSH] Sending completed:', {
            userId: userId.toString(),
            successful,
            failed,
        });

    } catch (error) {
        console.error('[PUSH] Push service error:', error.message);
    }
};
