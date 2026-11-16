import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  MessageCircle,
  Search,
  Send,
  UserRound,
  ArrowLeft,
  Inbox,
  Circle,
  Bell,
  CheckCheck,
  X,
} from "lucide-react";

import api from "../../services/api";
import { useAgentSocket } from "../../context/AgentSocketContext";

function AgentInboxPage() {
  const location = useLocation();
  const socket = useAgentSocket();

  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [visitorTyping, setVisitorTyping] = useState(false);

  // Notification states
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);

  // WhatsApp-style reminder popup
  const [reminderToast, setReminderToast] = useState(null);

  const socketRef = useRef(null);
  const selectedConversationRef = useRef(null);
  const joinedConversationRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingActiveRef = useRef(false);
  const handledNavigationRef = useRef(null);

  // Always keep latest conversations available to reminder timer
  const conversationsRef = useRef([]);
  const reminderToastTimeoutRef = useRef(null);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const mergeConversation = (previous, incoming) => {
    if (!incoming?._id) return previous;

    const exists = previous.some(
      (item) => item._id === incoming._id
    );

    if (exists) {
      return previous.map((item) =>
        item._id === incoming._id
          ? { ...item, ...incoming }
          : item
      );
    }

    return [
      { ...incoming, unreadCount: incoming.unreadCount || 0 },
      ...previous,
    ];
  };

  // Show WhatsApp-style popup
  const showReminderToast = (data) => {
    setReminderToast(data);

    if (reminderToastTimeoutRef.current) {
      clearTimeout(reminderToastTimeoutRef.current);
    }

    reminderToastTimeoutRef.current = setTimeout(() => {
      setReminderToast(null);
      reminderToastTimeoutRef.current = null;
    }, 7000);
  };

  // Fetch saved notifications when inbox opens
  useEffect(() => {
    let isMounted = true;

    const fetchNotifications = async () => {
      try {
        setNotificationLoading(true);

        const response = await api.get("/notifications");

        if (!isMounted) return;

        setNotifications(response.data?.notifications || []);
        setUnreadNotifications(response.data?.unreadCount || 0);
      } catch (err) {
        console.error("Fetch Notifications Error:", err);
      } finally {
        if (isMounted) {
          setNotificationLoading(false);
        }
      }
    };

    fetchNotifications();

    return () => {
      isMounted = false;
    };
  }, []);

  // Open a conversation from a notification
  const handleOpenNotification = async (notification) => {
    if (!notification?.conversation) return;

    try {
      // Mark saved notification as read
      if (
        notification._id &&
        !notification._id.startsWith("reminder-") &&
        !notification.isRead
      ) {
        await api.patch(
          `/notifications/${notification._id}/read`
        );

        setNotifications((previous) =>
          previous.map((item) =>
            item._id === notification._id
              ? { ...item, isRead: true }
              : item
          )
        );

        setUnreadNotifications((previous) =>
          Math.max(0, previous - 1)
        );
      }

      const conversationId =
        typeof notification.conversation === "object"
          ? notification.conversation._id
          : notification.conversation;

      let conversation = conversationsRef.current.find(
        (item) => item._id === conversationId
      );

      // Fetch conversations if target is not loaded
      if (!conversation) {
        const response = await api.get("/chat/conversations");

        const fetchedConversations =
          response.data?.conversations || [];

        setConversations((previous) => {
          const map = new Map(
            previous.map((item) => [item._id, item])
          );

          fetchedConversations.forEach((item) => {
            map.set(item._id, {
              ...map.get(item._id),
              ...item,
            });
          });

          return Array.from(map.values());
        });

        conversation = fetchedConversations.find(
          (item) => item._id === conversationId
        );
      }

      // Fallback using notification details
      if (!conversation) {
        conversation = {
          _id: conversationId,
          visitor: notification.visitor || {},
          widget: notification.widget || null,
          unreadCount: 0,
          lastMessage: notification.message || "",
          lastMessageAt: notification.createdAt,
        };
      }

      setSelectedConversation(conversation);
      setMessage("");
      setChatError("");
      setReminderToast(null);
      setNotificationOpen(false);
    } catch (err) {
      console.error("Open Notification Error:", err);
    }
  };

  // Receive real-time notification
  const handleAgentNotification = (notification) => {
    if (!notification?._id) return;

    let isDuplicate = false;

    setNotifications((previous) => {
      if (previous.some((item) => item._id === notification._id)) {
        isDuplicate = true;
        return previous;
      }

      return [notification, ...previous].slice(0, 50);
    });

    if (!isDuplicate && !notification.isRead) {
      setUnreadNotifications((previous) => previous + 1);
    }

    // Show in-dashboard popup
    showReminderToast(notification);

    // Browser notification when dashboard is in background
    if (
      document.visibilityState === "hidden" &&
      "Notification" in window &&
      window.Notification.permission === "granted"
    ) {
      const browserNotification = new window.Notification(
        notification.title || "New Notification",
        {
          body:
            notification.message ||
            "You have a new visitor update.",
          tag: notification._id,
        }
      );

      browserNotification.onclick = () => {
        window.focus();
        handleOpenNotification(notification);
        browserNotification.close();
      };
    }
  };

  // Toggle notification panel and request browser permission
  const handleToggleNotifications = async () => {
    setNotificationOpen((previous) => !previous);

    if (
      "Notification" in window &&
      window.Notification.permission === "default"
    ) {
      try {
        await window.Notification.requestPermission();
      } catch (err) {
        console.error("Notification Permission Error:", err);
      }
    }
  };

  // Mark all notifications as read
  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.patch("/notifications/read-all");

      setNotifications((previous) =>
        previous.map((item) => ({
          ...item,
          isRead: true,
        }))
      );

      setUnreadNotifications(0);
    } catch (err) {
      console.error("Mark All Notifications Read Error:", err);
    }
  };

  // Fetch conversations
  useEffect(() => {
    let isMounted = true;

    const fetchConversations = async () => {
      try {
        const response = await api.get("/chat/conversations");

        if (isMounted) {
          const fetched = response.data?.conversations || [];

          setConversations((previous) => {
            const conversationMap = new Map();

            previous.forEach((item) => {
              conversationMap.set(item._id, item);
            });

            fetched.forEach((item) => {
              conversationMap.set(item._id, {
                ...conversationMap.get(item._id),
                ...item,
              });
            });

            return Array.from(conversationMap.values()).sort(
              (a, b) =>
                new Date(b.lastMessageAt || b.createdAt || 0) -
                new Date(a.lastMessageAt || a.createdAt || 0)
            );
          });

          setError("");
        }
      } catch (err) {
        console.error("Fetch Conversations Error:", err);

        if (isMounted) {
          setError(
            err.response?.data?.message ||
              "Failed to load conversations."
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchConversations();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle navigation from other pages
  useEffect(() => {
    const navigationConversation = location.state?.conversation;

    if (!navigationConversation?._id) return;

    const navigationKey = `${location.key}:${navigationConversation._id}`;

    if (handledNavigationRef.current === navigationKey) return;

    handledNavigationRef.current = navigationKey;

    setConversations((previous) =>
      mergeConversation(previous, navigationConversation)
    );

    setSelectedConversation(navigationConversation);
    setChatError("");
    setMessage("");
  }, [location.key, location.state]);

  // Socket connection

  // Shared Socket Connection
  useEffect(() => {
    if (!socket) return;

    socketRef.current = socket;

    const handleConnect = () => {
      console.log("Agent socket connected:", socket.id);
      setSocketConnected(true);

      const current = selectedConversationRef.current;

      if (current?._id) {
        socket.emit(
          "join_conversation",
          { conversationId: current._id },
          (response) => {
            if (response?.success) {
              joinedConversationRef.current = current._id;
            } else {
              console.error(
                "Join Conversation Error:",
                response?.message
              );
            }
          }
        );
      }
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
      setVisitorTyping(false);
      joinedConversationRef.current = null;
      typingActiveRef.current = false;
    };

    const handleConnectError = (err) => {
      console.error("Agent Socket Connection Error:", err.message);
      setSocketConnected(false);
    };

    const handleNewConversation = (conversation) => {
      if (!conversation?._id) return;

      setConversations((previous) =>
        mergeConversation(previous, conversation)
      );
    };

    const handleNewMessage = (data) => {
      if (!data?._id || !data?.conversation) return;

      const conversationId =
        typeof data.conversation === "object"
          ? data.conversation._id
          : data.conversation;

      setConversations((previous) =>
        previous.map((conversation) =>
          conversation._id === conversationId
            ? {
                ...conversation,
                lastMessage: data.content,
                lastMessageAt:
                  data.createdAt || new Date().toISOString(),
              }
            : conversation
        )
      );

      if (
        selectedConversationRef.current?._id === conversationId
      ) {
        setMessages((previous) => {
          if (previous.some((item) => item._id === data._id)) {
            return previous;
          }

          return [...previous, data];
        });

        if (data.senderType === "visitor") {
          api
            .get(`/chat/${conversationId}/messages`)
            .then((response) => {
              const current = selectedConversationRef.current;

              if (current?._id === conversationId) {
                setMessages(response.data.messages || []);

                setConversations((previous) =>
                  previous.map((item) =>
                    item._id === conversationId
                      ? { ...item, unreadCount: 0 }
                      : item
                  )
                );

                setSelectedConversation((previous) =>
                  previous?._id === conversationId
                    ? { ...previous, unreadCount: 0 }
                    : previous
                );
              }
            })
            .catch((err) => {
              console.error("Mark Messages Read Error:", err);
            });
        }
      }
    };

    const handleInboxNewMessage = (data) => {
      if (!data?._id || !data?.conversation) return;

      const conversationId =
        typeof data.conversation === "object"
          ? data.conversation._id
          : data.conversation;

      setConversations((previous) =>
        previous.map((conversation) => {
          if (conversation._id !== conversationId) {
            return conversation;
          }

          const isCurrentlySelected =
            selectedConversationRef.current?._id === conversationId;

          return {
            ...conversation,
            lastMessage: data.content,
            lastMessageAt:
              data.createdAt || new Date().toISOString(),
            unreadCount: isCurrentlySelected
              ? 0
              : (conversation.unreadCount || 0) + 1,
          };
        })
      );
    };

    const handleVisitorStatus = (data) => {
      if (!data?.visitorDbId) return;

      const updateVisitorStatus = (conversation) => {
        if (
          conversation.visitor?._id !== data.visitorDbId
        ) {
          return conversation;
        }

        const conversationWidgetId =
          typeof conversation.widget === "object"
            ? conversation.widget?._id
            : conversation.widget;

        if (
          conversationWidgetId &&
          data.widgetId &&
          conversationWidgetId.toString() !== data.widgetId.toString()
        ) {
          return conversation;
        }

        return {
          ...conversation,
          visitor: {
            ...conversation.visitor,
            isOnline: Boolean(data.isOnline),
            lastSeen:
              data.lastSeen || conversation.visitor.lastSeen,
          },
        };
      };

      setConversations((previous) =>
        previous.map(updateVisitorStatus)
      );

      setSelectedConversation((previous) =>
        previous ? updateVisitorStatus(previous) : previous
      );
    };

    const handleUserTyping = (data) => {
      const current = selectedConversationRef.current;

      if (
        !current?._id ||
        data?.conversationId !== current._id ||
        data?.senderType !== "visitor"
      ) {
        return;
      }

      setVisitorTyping(Boolean(data.isTyping));
    };

    // Register Inbox-specific listeners
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("new_conversation", handleNewConversation);
    socket.on("new_message", handleNewMessage);
    socket.on("inbox_new_message", handleInboxNewMessage);
    socket.on("visitor_status", handleVisitorStatus);
    socket.on("user_typing", handleUserTyping);
    socket.on("agent_notification", handleAgentNotification);

    // Shared socket might already be connected
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("new_conversation", handleNewConversation);
      socket.off("new_message", handleNewMessage);
      socket.off("inbox_new_message", handleInboxNewMessage);
      socket.off("visitor_status", handleVisitorStatus);
      socket.off("user_typing", handleUserTyping);
      socket.off("agent_notification", handleAgentNotification);

      // Do not disconnect the shared socket
      socketRef.current = null;
      joinedConversationRef.current = null;
    };
  }, [socket]);


  // UNREAD MESSAGE REMINDER - Every 5 minutes


  // Load selected conversation messages
  useEffect(() => {
    const conversationId = selectedConversation?._id;

    if (!conversationId) {
      setMessages([]);
      setVisitorTyping(false);
      return;
    }

    let isMounted = true;

    setMessages([]);
    setChatError("");
    setVisitorTyping(false);
    setMessagesLoading(true);

    const socket = socketRef.current;

    if (socket?.connected) {
      const previousJoinedId = joinedConversationRef.current;

      if (
        previousJoinedId &&
        previousJoinedId !== conversationId
      ) {
        socket.emit("leave_conversation", {
          conversationId: previousJoinedId,
        });
      }

      socket.emit(
        "join_conversation",
        { conversationId },
        (response) => {
          if (response?.success) {
            joinedConversationRef.current = conversationId;
          } else {
            console.error(
              "Join Conversation Error:",
              response?.message
            );
          }
        }
      );
    }

    const loadMessages = async () => {
      try {
        const response = await api.get(
          `/chat/${conversationId}/messages`
        );

        if (isMounted) {
          setMessages(response.data?.messages || []);

          setConversations((previous) =>
            previous.map((item) =>
              item._id === conversationId
                ? { ...item, unreadCount: 0 }
                : item
            )
          );

          setSelectedConversation((previous) =>
            previous?._id === conversationId
              ? { ...previous, unreadCount: 0 }
              : previous
          );
        }
      } catch (err) {
        console.error("Load Messages Error:", err);

        if (isMounted) {
          setChatError(
            err.response?.data?.message ||
              "Failed to load messages."
          );
        }
      } finally {
        if (isMounted) setMessagesLoading(false);
      }
    };

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [selectedConversation?._id]);

  // Rejoin conversation after socket reconnection
  useEffect(() => {
    if (!socketConnected || !selectedConversation?._id) return;

    const socket = socketRef.current;
    const conversationId = selectedConversation._id;

    if (
      !socket?.connected ||
      joinedConversationRef.current === conversationId
    ) {
      return;
    }

    socket.emit(
      "join_conversation",
      { conversationId },
      (response) => {
        if (response?.success) {
          joinedConversationRef.current = conversationId;
        }
      }
    );
  }, [socketConnected, selectedConversation?._id]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, visitorTyping]);

  // Search conversations
  const filteredConversations = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    if (!searchText) return conversations;

    return conversations.filter((conversation) => {
      const visitorName = conversation.visitor?.name || "";
      const visitorEmail = conversation.visitor?.email || "";

      const widgetName =
        typeof conversation.widget === "object"
          ? conversation.widget?.name || ""
          : "";

      return (
        visitorName.toLowerCase().includes(searchText) ||
        visitorEmail.toLowerCase().includes(searchText) ||
        widgetName.toLowerCase().includes(searchText)
      );
    });
  }, [conversations, search]);

  // Typing indicator
  const handleTyping = (value) => {
    setMessage(value);

    const conversationId = selectedConversationRef.current?._id;
    const socket = socketRef.current;

    if (!conversationId || !socket?.connected) return;

    if (value.trim()) {
      if (!typingActiveRef.current) {
        typingActiveRef.current = true;
        socket.emit("typing_start", { conversationId });
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing_stop", { conversationId });
        typingActiveRef.current = false;
      }, 1000);
    } else {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      if (typingActiveRef.current) {
        socket.emit("typing_stop", { conversationId });
        typingActiveRef.current = false;
      }
    }
  };

  // Send agent message
  const handleSendMessage = (e) => {
    e.preventDefault();

    const content = message.trim();
    const conversationId = selectedConversation?._id;
    const socket = socketRef.current;

    if (!content || !conversationId || sending) return;

    if (!socket?.connected) {
      setChatError(
        "Connection lost. Please wait for reconnection."
      );
      return;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (typingActiveRef.current) {
      socket.emit("typing_stop", { conversationId });
      typingActiveRef.current = false;
    }

    setSending(true);
    setChatError("");

    socket.emit(
      "send_message",
      { conversationId, content },
      (response) => {
        setSending(false);

        if (!response?.success) {
          setChatError(
            response?.message || "Message could not be sent."
          );
          return;
        }

        setMessage("");
      }
    );
  };

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
    setMessage("");
    setChatError("");
  };

  const formatTime = (date) => {
    if (!date) return "";

    const timestamp = new Date(date);

    if (Number.isNaN(timestamp.getTime())) return "";

    return timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col bg-[#f8f9fc] p-3 sm:p-4 lg:p-6">

      {/* WhatsApp-style reminder popup */}
      {reminderToast && (
        <div className="fixed right-4 top-4 z-[9999] w-[min(380px,calc(100vw-32px))] animate-in slide-in-from-top-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[#6650d9]">
              <MessageCircle size={21} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900">
                {reminderToast.title}
              </p>

              <p className="mt-1 text-xs leading-5 text-gray-600">
                {reminderToast.message}
              </p>

              <button
                type="button"
                onClick={() => handleOpenNotification(reminderToast)}
                className="mt-3 rounded-lg bg-[#6650d9] px-3 py-2 text-xs font-semibold text-white hover:bg-[#5540c5]"
              >
                Open Conversation
              </button>
            </div>

            <button
              type="button"
              onClick={() => setReminderToast(null)}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col">

        {/* Inbox Heading + Notification Bell */}
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3 sm:mb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Inbox
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage and reply to your customer conversations.
            </p>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={handleToggleNotifications}
              className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50"
              aria-label="Notifications"
            >
              <Bell size={20} />

              {unreadNotifications > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadNotifications > 99
                    ? "99+"
                    : unreadNotifications}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {notificationOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close notifications"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setNotificationOpen(false)}
                />

                <div className="absolute right-0 top-14 z-50 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Notifications
                      </h3>
                      <p className="text-xs text-gray-500">
                        {unreadNotifications} unread notifications
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {unreadNotifications > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllNotificationsRead}
                          title="Mark all as read"
                          className="rounded-lg p-2 text-[#6650d9] transition hover:bg-purple-50"
                        >
                          <CheckCheck size={18} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setNotificationOpen(false)}
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[380px] overflow-y-auto">
                    {notificationLoading ? (
                      <p className="p-6 text-center text-sm text-gray-400">
                        Loading notifications...
                      </p>
                    ) : notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell
                          size={28}
                          className="mx-auto mb-2 text-gray-300"
                        />
                        <p className="text-sm font-medium text-gray-700">
                          No notifications yet
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          New visitor updates will appear here.
                        </p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          key={notification._id}
                          type="button"
                          onClick={() =>
                            handleOpenNotification(notification)
                          }
                          className={`flex w-full gap-3 border-b border-gray-100 p-4 text-left transition hover:bg-gray-50 ${
                            !notification.isRead
                              ? "bg-purple-50/60"
                              : ""
                          }`}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[#6650d9]">
                            {notification.type === "new_visitor" ? (
                              <UserRound size={18} />
                            ) : (
                              <MessageCircle size={18} />
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

                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">
                              {notification.message}
                            </p>

                            {notification.widget?.name && (
                              <p className="mt-1 truncate text-[10px] font-medium text-[#6650d9]">
                                {notification.widget.name}
                              </p>
                            )}

                            <p className="mt-1 text-[10px] text-gray-400">
                              {notification.createdAt
                                ? new Date(
                                    notification.createdAt
                                  ).toLocaleString()
                                : ""}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid h-[calc(100dvh-145px)] min-h-[420px] w-full min-w-0 grid-cols-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:h-[calc(100dvh-155px)] md:min-h-[500px] md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[350px_minmax(0,1fr)]">

          {/* Conversation Sidebar */}
          <aside
            className={`${
              selectedConversation ? "hidden" : "flex"
            } min-h-0 min-w-0 flex-col overflow-hidden border-r border-gray-100 bg-white md:flex`}
          >
            <div className="shrink-0 border-b border-gray-100 p-4">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[#6650d9] focus:bg-white focus:ring-2 focus:ring-purple-100"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-full items-center justify-center p-6">
                  <p className="text-sm text-gray-400">
                    Loading conversations...
                  </p>
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <p className="text-sm text-red-500">{error}</p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-[#6650d9]">
                      <Inbox size={26} />
                    </div>
                    <h3 className="font-semibold text-gray-800">
                      {search
                        ? "No matching conversations"
                        : "No conversations yet"}
                    </h3>
                    <p className="mt-1 text-sm text-gray-400">
                      {search
                        ? "Try another search."
                        : "New visitor chats will appear here."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredConversations.map((conversation) => {
                    const visitor = conversation.visitor;
                    const isSelected =
                      selectedConversation?._id === conversation._id;
                    const unreadCount = conversation.unreadCount || 0;

                    const widgetName =
                      typeof conversation.widget === "object"
                        ? conversation.widget?.name
                        : "";

                    return (
                      <button
                        key={conversation._id}
                        onClick={() =>
                          handleSelectConversation(conversation)
                        }
                        className={`flex w-full min-w-0 items-center gap-3 p-4 text-left transition hover:bg-gray-50 ${
                          isSelected
                            ? "bg-purple-50"
                            : unreadCount > 0
                              ? "bg-purple-50/50"
                              : ""
                        }`}
                      >
                        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[#6650d9]">
                          <UserRound size={20} />
                          {visitor?.isOnline && (
                            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3
                              className={`truncate text-sm ${
                                unreadCount > 0
                                  ? "font-bold text-gray-900"
                                  : "font-semibold text-gray-800"
                              }`}
                            >
                              {visitor?.name || "Visitor"}
                            </h3>
                            <span className="shrink-0 text-[10px] text-gray-400">
                              {formatTime(
                                conversation.lastMessageAt ||
                                  conversation.createdAt
                              )}
                            </span>
                          </div>

                          {widgetName && (
                            <p className="mt-1 truncate text-[10px] font-medium text-[#6650d9]">
                              {widgetName}
                            </p>
                          )}

                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p
                              className={`truncate text-xs ${
                                unreadCount > 0
                                  ? "font-semibold text-gray-700"
                                  : "text-gray-500"
                              }`}
                            >
                              {conversation.lastMessage ||
                                visitor?.email ||
                                "New conversation"}
                            </p>

                            {unreadCount > 0 && (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#6650d9] px-1.5 text-[10px] font-bold text-white">
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-1">
                            <Circle
                              size={7}
                              className={
                                visitor?.isOnline
                                  ? "fill-green-500 text-green-500"
                                  : "fill-gray-300 text-gray-300"
                              }
                            />
                            <span className="text-[10px] text-gray-400">
                              {visitor?.isOnline ? "Online" : "Offline"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          {/* Chat Panel */}
          <section
            className={`${
              selectedConversation ? "flex" : "hidden"
            } min-h-0 min-w-0 flex-col overflow-hidden bg-white md:flex`}
          >
            {selectedConversation ? (
              <>
                {/* Chat Header */}
                <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 bg-white px-3 py-3 sm:px-5">
                  <button
                    onClick={() => setSelectedConversation(null)}
                    className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 md:hidden"
                  >
                    <ArrowLeft size={20} />
                  </button>

                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[#6650d9]">
                    <UserRound size={20} />
                    {selectedConversation.visitor?.isOnline && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-gray-800">
                      {selectedConversation.visitor?.name || "Visitor"}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {visitorTyping
                        ? "Typing..."
                        : selectedConversation.visitor?.isOnline
                          ? "Online"
                          : "Offline"}
                    </p>
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1.5">
                    <Circle
                      size={8}
                      className={
                        socketConnected
                          ? "fill-green-500 text-green-500"
                          : "fill-red-500 text-red-500"
                      }
                    />
                    <span className="hidden text-xs text-gray-500 sm:inline">
                      {socketConnected ? "Connected" : "Connecting..."}
                    </span>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[#f8f9fc] p-3 sm:p-4 md:p-6">
                  {messagesLoading ? (
                    <div className="flex flex-1 items-center justify-center">
                      <p className="text-sm text-gray-400">
                        Loading messages...
                      </p>
                    </div>
                  ) : chatError && messages.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-red-500">
                      {chatError}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                      No messages yet. Start the conversation!
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-col gap-4">
                      {messages.map((item) => {
                        const isAgent = item.senderType === "agent";

                        return (
                          <div
                            key={item._id}
                            className={`flex w-full min-w-0 ${
                              isAgent ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`w-fit max-w-[85%] break-words rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ${
                                isAgent
                                  ? "rounded-br-md bg-[#6650d9] text-white"
                                  : "rounded-bl-md border border-gray-100 bg-white text-gray-800"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words text-sm">
                                {item.content}
                              </p>
                              <p
                                className={`mt-1 text-right text-[10px] ${
                                  isAgent
                                    ? "text-purple-200"
                                    : "text-gray-400"
                                }`}
                              >
                                {formatTime(item.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}

                      {visitorTyping && (
                        <div className="flex justify-start">
                          <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3 shadow-sm">
                            <span className="text-xs font-medium text-gray-500">
                              Typing
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6650d9] [animation-delay:-0.3s]" />
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6650d9] [animation-delay:-0.15s]" />
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#6650d9]" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {chatError && (
                  <p className="shrink-0 border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
                    {chatError}
                  </p>
                )}

                {/* Message Input */}
                <form
                  onSubmit={handleSendMessage}
                  className="flex shrink-0 items-center gap-2 border-t border-gray-100 bg-white p-3 sm:gap-3 sm:p-4"
                >
                  <input
                    value={message}
                    onChange={(e) => handleTyping(e.target.value)}
                    placeholder="Type your message..."
                    maxLength={5000}
                    disabled={!socketConnected || sending}
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm outline-none transition focus:border-[#6650d9] focus:bg-white focus:ring-2 focus:ring-purple-100 disabled:bg-gray-100 sm:px-4"
                  />

                  <button
                    type="submit"
                    disabled={
                      !message.trim() || !socketConnected || sending
                    }
                    className="flex shrink-0 items-center justify-center rounded-xl bg-[#6650d9] p-3 text-white transition hover:bg-[#5540c5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-50 text-[#6650d9]">
                  <MessageCircle size={30} />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">
                  Your conversations
                </h2>
                <p className="mt-1 max-w-xs text-sm text-gray-400">
                  Select a conversation from the left to start chatting with a visitor.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default AgentInboxPage;
