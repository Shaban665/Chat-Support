
import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

let vapidConfigured = false;

const configureWebPush = () => {
    if (vapidConfigured) return true;

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
        console.warn('Web Push is disabled: VAPID environment variables are missing.');
        return false;
    }

    try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        vapidConfigured = true;
        return true;
    } catch (error) {
        console.error('Web Push VAPID Configuration Error:', error.message);
        return false;
    }
};

export const sendPushToUser = async (userId, payload) => {
    if (!configureWebPush()) return;

    try {
        const subscriptions = await PushSubscription.find({ user: userId });

        if (!subscriptions.length) return;

        await Promise.allSettled(
            subscriptions.map(async (savedSubscription) => {
                const subscription = {
                    endpoint: savedSubscription.endpoint,
                    expirationTime: savedSubscription.expirationTime,
                    keys: savedSubscription.keys,
                };

                try {
                    await webpush.sendNotification(
                        subscription,
                        JSON.stringify(payload)
                    );
                } catch (error) {
                    if (error.statusCode === 404 || error.statusCode === 410) {
                        await PushSubscription.deleteOne({
                            _id: savedSubscription._id,
                        });
                    } else {
                        console.error('Push Notification Error:', error.message);
                    }
                }
            })
        );
    } catch (error) {
        console.error('Push Service Error:', error.message);
    }
};
