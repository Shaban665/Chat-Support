
import { useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  MessageCircle,
  UserRound,
  X,
} from "lucide-react";

import api from "../../services/api";

function AgentNotificationBell({ socket, onOpenConversation }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch saved notifications from MongoDB
  useEffect(() => {
    let isMounted = true;

    const fetchNotifications = async () => {
      try {
        setLoading(true);

        const response = await api.get("/notifications");

        if (!isMounted) return;

        setNotifications(response.data?.notifications || []);
        setUnreadCount(response.data?.unreadCount || 0);
      } catch (error) {
        console.error("Fetch Notifications Error:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchNotifications();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for real-time notifications
  useEffect(() => {
    if (!socket) return;

    const handleAgentNotification = (notification) => {
      if (!notification?._id) return;

      setNotifications((previous) => {
        if (previous.some((item) => item._id === notification._id)) {
          return previous;
        }

        return [notification, ...previous].slice(0, 50);
      });

      if (!notification.isRead) {
        setUnreadCount((previous) => previous + 1);
      }

      // Show desktop notification when dashboard is in background
      if (
        document.visibilityState === "hidden" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const browserNotification = new Notification(
          notification.title || "New notification",
          {
            body: notification.message || "You received a new notification.",
            tag: notification._id,
          }
        );

        browserNotification.onclick = () => {
          window.focus();
          onOpenConversation?.(notification);
          browserNotification.close();
        };
      }
    };

    socket.on("agent_notification", handleAgentNotification);

    return () => {
      socket.off("agent_notification", handleAgentNotification);
    };
  }, [socket, onOpenConversation]);

  // Request browser notification permission
  const handleToggle = async () => {
    if (
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.error("Notification Permission Error:", error);
      }
    }

    setIsOpen((previous) => !previous);
  };

  // Mark one notification as read
  const handleMarkAsRead = async (notification) => {
    if (notification.isRead) return;

    try {
      const response = await api.patch(
        `/notifications/${notification._id}/read`
      );

      if (response.data?.success) {
        setNotifications((previous) =>
          previous.map((item) =>
            item._id === notification._id
              ? { ...item, isRead: true, readAt: new Date().toISOString() }
              : item
          )
        );

        setUnreadCount((previous) => Math.max(0, previous - 1));
      }
    } catch (error) {
      console.error("Mark Notification Read Error:", error);
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;

    try {
      const response = await api.patch("/notifications/read-all");

      if (response.data?.success) {
        setNotifications((previous) =>
          previous.map((item) => ({
            ...item,
            isRead: true,
            readAt: item.readAt || new Date().toISOString(),
          }))
        );

        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Mark All Notifications Read Error:", error);
    }
  };

  // Open related conversation
  const handleNotificationClick = async (notification) => {
    await handleMarkAsRead(notification);

    setIsOpen(false);

    if (notification.conversation) {
      onOpenConversation?.(notification);
    }
  };

  const formatTime = (date) => {
    if (!date) return "";

    const timestamp = new Date(date);

    if (Number.isNaN(timestamp.getTime())) return "";

    return timestamp.toLocaleString([], {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        aria-expanded={isOpen}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-[#6650d9]"
      >
        <Bell size={19} />

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div className="absolute right-0 top-12 z-50 flex max-h-[min(520px,75vh)] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h3 className="font-semibold text-gray-900">
                  Notifications
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {unreadCount} unread notifications
                </p>
              </div>

              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    title="Mark all as read"
                    className="rounded-lg p-2 text-[#6650d9] transition hover:bg-purple-50"
                  >
                    <CheckCheck size={18} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-sm text-gray-400">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-[#6650d9]">
                    <Bell size={22} />
                  </div>

                  <p className="font-semibold text-gray-800">
                    All caught up!
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    New visitor activity will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map((notification) => (
                    <button
                      key={notification._id}
                      type="button"
                      onClick={() =>
                        handleNotificationClick(notification)
                      }
                      className={`flex w-full gap-3 p-4 text-left transition hover:bg-gray-50 ${
                        !notification.isRead ? "bg-purple-50/50" : ""
                      }`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[#6650d9]">
                        {notification.type === "new_visitor" ? (
                          <UserRound size={19} />
                        ) : (
                          <MessageCircle size={19} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800">
                            {notification.title}
                          </p>

                          {!notification.isRead && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#6650d9]" />
                          )}
                        </div>

                        <p className="mt-1 break-words text-xs leading-5 text-gray-600">
                          {notification.message}
                        </p>

                        {notification.widget?.name && (
                          <p className="mt-1 truncate text-[10px] font-medium text-[#6650d9]">
                            {notification.widget.name}
                          </p>
                        )}

                        <p className="mt-1 text-[10px] text-gray-400">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-gray-100 px-4 py-2.5">
              <p className="text-center text-[10px] text-gray-400">
                Click a notification to open its conversation
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AgentNotificationBell;
