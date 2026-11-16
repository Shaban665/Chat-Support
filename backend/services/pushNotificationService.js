
import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

const isVapidConfigured =
    Boolean(process.env.VAPID_PUBLIC_KEY) &&
    Boolean(process.env.VAPID_PRIVATE_KEY) &&
    Boolean(process.env.VAPID_SUBJECT);

if (isVapidConfigured) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn(
        'Web Push is disabled: VAPID environment variables are missing.'
    );
}

export const sendPushToUser = async (userId, payload) => {
    if (!isVapidConfigured) {
        return;
    }

    try {
        const subscriptions = await PushSubscription.find({
            user: userId,
        });

        if (!subscriptions.length) {
            return;
        }

        await Promise.allSettled(
            subscriptions.map(async (savedSubscription) => {
                const subscription = {
                    endpoint: savedSubscription.endpoint,
                    expirationTime:
                        savedSubscription.expirationTime,
                    keys: savedSubscription.keys,
                };

                try {
                    await webpush.sendNotification(
                        subscription,
                        JSON.stringify(payload)
                    );
                } catch (error) {
                    // Remove expired or invalid subscriptions.
                    if (error.statusCode === 404 || error.statusCode === 410) {
                        await PushSubscription.deleteOne({
                            _id: savedSubscription._id,
                        });
                    } else {
                        console.error(
                            'Push Notification Error:',
                            error.message
                        );
                    }
                }
            })
        );
    } catch (error) {
        console.error(
            'Push Service Error:',
            error.message
        );
    }
};
