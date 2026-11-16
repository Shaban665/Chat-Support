
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let data = {};

    try {
        data = event.data.json();
    } catch (error) {
        data = {
            title: 'BulkChat',
            body: event.data.text(),
        };
    }

    const title = data.title || 'BulkChat Notification';

    const options = {
        body: data.body || 'You have a new notification.',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: data.notificationId || data.conversationId || 'bulkchat-notification',
        data: {
            url: data.url || '/agent/inbox',
            conversationId: data.conversationId || null,
        },
        vibrate: [200, 100, 200],
        requireInteraction: true,
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = new URL(
        event.notification.data?.url || '/agent/inbox',
        self.location.origin
    ).href;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
        }).then((windowClients) => {
            for (const client of windowClients) {
                if (client.url.startsWith(self.location.origin)) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }

            return clients.openWindow(targetUrl);
        })
    );
});
