
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import {
  Send,
  MessageCircle,
  Headset,
  ShieldCheck,
  UserRound,
  Mail,
  ArrowLeft,
  X,
} from "lucide-react";

import api from "../../services/api";
import {
  getVisitorId,
  trackVisitor,
} from "../../utils/visitor";
import { connectVisitorSocket } from "../../services/socket";

// Normalize backend message and Socket.IO acknowledgement.
const normalizeMessage = (payload) => {
  if (!payload) return null;

  let data = payload;

  if (payload.data && typeof payload.data === "object") {
    data = payload.data;
  }

  if (data.message && typeof data.message === "object") {
    data = data.message;
  }

  if (!data.content) return null;

  return {
    id: String(data._id || data.id || ""),
    text: data.content,
    sender: data.senderType === "visitor" ? "customer" : "agent",
    time: data.createdAt || new Date(),
  };
};

function EmbeddedChatPage() {
  // Dynamic widget public key from /widget/:publicKey
  const { publicKey: routePublicKey } = useParams();

  const publicKey =
    routePublicKey || import.meta.env.VITE_WIDGET_PUBLIC_KEY;

  const [parentInfo, setParentInfo] = useState(null);

  const [customer, setCustomer] = useState({
    name: "",
    email: "",
  });

  const [chatStarted, setChatStarted] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  const [conversationId, setConversationId] = useState(null);
  const [visitorId, setVisitorId] = useState(null);

  const [isStartingChat, setIsStartingChat] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isConversationJoined, setIsConversationJoined] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);

  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");

  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isVisitorTypingRef = useRef(false);
  const joinedConversationRef = useRef(false);

  // Receive and validate parent website information.
  useEffect(() => {
    const handleParentMessage = (event) => {
      // Only accept messages from the actual parent window.
      if (event.source !== window.parent) {
        return;
      }

      if (!event.origin || event.origin === "null") {
        return;
      }

      const data = event.data;

      if (
        !data ||
        typeof data !== "object" ||
        data.type !== "BULKCHAT_PARENT_INFO"
      ) {
        return;
      }

      if (
        typeof data.currentPage !== "string" ||
        data.currentPage.length > 4096
      ) {
        return;
      }

      try {
        const parsedPage = new URL(data.currentPage);

        if (
          !["http:", "https:"].includes(parsedPage.protocol) ||
          parsedPage.origin !== event.origin
        ) {
          console.warn("Rejected invalid parent website information");
          return;
        }

        const referrer =
          typeof data.referrer === "string" &&
          data.referrer.length <= 4096
            ? data.referrer
            : "";

        setParentInfo({
          parentOrigin: event.origin,
          currentPage: parsedPage.href,
          referrer,
        });

        setError("");
      } catch {
        console.warn("Invalid parent website URL");
      }
    };

    window.addEventListener("message", handleParentMessage);

    return () => {
      window.removeEventListener("message", handleParentMessage);
    };
  }, []);

  // Add message without duplicate entries.
  const addMessage = (incomingMessage) => {
    if (!incomingMessage) return;

    setMessages((prev) => {
      if (
        incomingMessage.id &&
        prev.some((item) => item.id === incomingMessage.id)
      ) {
        return prev;
      }

      return [...prev, incomingMessage];
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      
    });
  }, [messages, isAgentTyping]);

  // Close widget through the parent website.
  const handleCloseWidget = () => {
    if (!parentInfo?.parentOrigin) return;

    window.parent.postMessage(
      {
        type: "BULKCHAT_CLOSE",
      },
      parentInfo.parentOrigin
    );
  };

  // Stop visitor typing.
  const stopVisitorTyping = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (isVisitorTypingRef.current) {
      if (
        socketRef.current?.connected &&
        joinedConversationRef.current
      ) {
        socketRef.current.emit("typing_stop", {
          conversationId,
        });
      }

      isVisitorTypingRef.current = false;
    }
  };

  // Handle message input and typing indicator.
  const handleMessageChange = (e) => {
    const value = e.target.value;
    setMessage(value);

    const socket = socketRef.current;

    if (
      !socket?.connected ||
      !joinedConversationRef.current ||
      !conversationId
    ) {
      return;
    }

    if (!value.trim()) {
      stopVisitorTyping();
      return;
    }

    if (!isVisitorTypingRef.current) {
      socket.emit("typing_start", {
        conversationId,
      });

      isVisitorTypingRef.current = true;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopVisitorTyping();
    }, 1000);
  };

  // Visitor Socket.IO connection.
  useEffect(() => {
    if (
      !chatStarted ||
      !conversationId ||
      !visitorId ||
      !parentInfo ||
      !publicKey
    ) {
      return;
    }

    let isEffectActive = true;

    const socket = connectVisitorSocket(
      publicKey,
      visitorId,
      parentInfo.parentOrigin,
      parentInfo.currentPage
    );

    socketRef.current = socket;

    joinedConversationRef.current = false;
    setIsConversationJoined(false);
    setIsSocketConnected(false);

    // Join conversation after every successful connection.
    const joinConversation = () => {
      if (!isEffectActive) return;

      console.log("Visitor socket connected:", socket.id);

      setIsSocketConnected(true);
      setChatError("");

      joinedConversationRef.current = false;
      setIsConversationJoined(false);

      socket.emit(
        "join_conversation",
        { conversationId },
        (result) => {
          if (!isEffectActive) return;

          if (!result?.success) {
            console.error("Visitor join failed:", result);

            setChatError(
              result?.message || "Unable to join conversation."
            );

            return;
          }

          console.log(
            "Visitor joined conversation:",
            conversationId
          );

          joinedConversationRef.current = true;
          setIsConversationJoined(true);
          setChatError("");
        }
      );
    };

    // Receive messages.
    const handleNewMessage = (payload) => {
      console.log("Visitor received message:", payload);

      const incomingMessage = normalizeMessage(payload);

      if (!incomingMessage) {
        console.warn("Invalid message payload:", payload);
        return;
      }

      if (incomingMessage.sender === "agent") {
        setIsAgentTyping(false);
      }

      addMessage(incomingMessage);
    };

    // Agent typing indicator.
    const handleTyping = (data) => {
      if (
        String(data?.conversationId) !== String(conversationId) ||
        data?.senderType !== "agent"
      ) {
        return;
      }

      setIsAgentTyping(Boolean(data.isTyping));
    };

    // Socket connection error.
    const handleConnectError = (err) => {
      console.error(
        "Visitor socket connection error:",
        err.message
      );

      setIsSocketConnected(false);
      setIsConversationJoined(false);
      joinedConversationRef.current = false;
      setIsAgentTyping(false);

      setChatError(
        `Connection error: ${err.message || "Unable to connect"}`
      );
    };

    // Socket disconnected.
    const handleDisconnect = (reason) => {
      console.log("Visitor socket disconnected:", reason);

      setIsSocketConnected(false);
      setIsConversationJoined(false);
      joinedConversationRef.current = false;
      setIsAgentTyping(false);
      isVisitorTypingRef.current = false;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };

    // Register ALL listeners before connecting.
    socket.on("connect", joinConversation);
    socket.on("new_message", handleNewMessage);
    socket.on("user_typing", handleTyping);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);

    socket.connect();

    return () => {
      isEffectActive = false;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      socket.off("connect", joinConversation);
      socket.off("new_message", handleNewMessage);
      socket.off("user_typing", handleTyping);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);

      socket.disconnect();

      joinedConversationRef.current = false;
      isVisitorTypingRef.current = false;

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [
    chatStarted,
    conversationId,
    visitorId,
    parentInfo,
    publicKey,
  ]);

  // Customer details.
  const handleCustomerChange = (e) => {
    const { name, value } = e.target;

    setCustomer((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Start conversation.
  const handleStartChat = async (e) => {
    e.preventDefault();

    if (isStartingChat) return;

    try {
      setIsStartingChat(true);
      setError("");

      if (!publicKey) {
        throw new Error("Widget Public Key is missing.");
      }

      if (!parentInfo?.parentOrigin || !parentInfo?.currentPage) {
        throw new Error(
          "Website information is not available. Please reload the page."
        );
      }

      const currentVisitorId = getVisitorId(publicKey);

      // Track visitor using actual parent website information.
      await trackVisitor(
        publicKey,
        currentVisitorId,
        parentInfo
      );

      const response = await api.post("/chat/conversation", {
        publicKey,
        visitorId: currentVisitorId,
        name: customer.name.trim(),
        email: customer.email.trim(),
        parentOrigin: parentInfo.parentOrigin,
      });

      const conversation = response.data?.conversation;

      if (!response.data?.success || !conversation?._id) {
        throw new Error(
          response.data?.message || "Unable to start conversation"
        );
      }

            setVisitorId(currentVisitorId);
      setConversationId(conversation._id);

      // Normalize automatic welcome message from backend
      const welcomeMessage = normalizeMessage(
        response.data?.welcomeMessage
      );

      // Show welcome message immediately in visitor chat
      setMessages(welcomeMessage ? [welcomeMessage] : []);

      setMessage("");
      setChatError("");
      setIsAgentTyping(false);
      setIsConversationJoined(false);
      setIsSocketConnected(false);

      joinedConversationRef.current = false;

      setChatStarted(true);
    } catch (err) {
      console.error("Start chat error:", err);

      setError(
        err.response?.data?.message ||
          err.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setIsStartingChat(false);
    }
  };

  // Send visitor message.
  const handleSendMessage = (e) => {
    e.preventDefault();

    const trimmedMessage = message.trim();

    if (!trimmedMessage || !chatStarted || isSending) return;

    const socket = socketRef.current;

    if (
      !socket?.connected ||
      !conversationId ||
      !joinedConversationRef.current
    ) {
      setChatError(
        "Connecting to conversation. Please wait and try again."
      );
      return;
    }

    setChatError("");
    setIsSending(true);

    stopVisitorTyping();

    socket.emit(
      "send_message",
      {
        conversationId,
        content: trimmedMessage,
      },
      (result) => {
        console.log("Visitor message acknowledgement:", result);

        setIsSending(false);

        if (!result?.success) {
          setChatError(
            result?.message || "Message could not be sent."
          );
          return;
        }

        const savedMessage = normalizeMessage(result.data);

        if (savedMessage) {
          addMessage(savedMessage);
        } else {
          console.warn("Invalid message acknowledgement:", result);
        }

        setMessage("");
        setChatError("");
      }
    );
  };

  // Enter to send.
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const formatTime = (time) => {
    return new Date(time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Wait until the parent website sends its information.
  if (!parentInfo) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#f8f9fc] px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eeeaff] text-[#6650d9]">
          <MessageCircle size={28} />
        </div>

        <h2 className="mt-4 text-base font-bold text-gray-900">
          BulkChat Support
        </h2>

        <p className="mt-2 max-w-xs text-xs leading-5 text-gray-500">
          Waiting for website connection. Please open this chat through the website's support widget.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#f8f9fc]">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#6650d9] px-4 py-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
            <Headset size={22} />
          </div>

          <div>
            <h2 className="text-sm font-bold">
            Customer Support
            </h2>

            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  isSocketConnected && isConversationJoined
                    ? "bg-green-400"
                    : "bg-yellow-300"
                }`}
              />

              <p className="text-xs text-purple-100">
                {isSocketConnected && isConversationJoined
                  ? "Connected to support"
                  : isSocketConnected
                    ? "Joining conversation..."
                    : "Connecting..."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <ShieldCheck size={14} />
            <span className="text-xs font-medium">Support</span>
          </div>

          <button
            type="button"
            onClick={handleCloseWidget}
            aria-label="Close chat"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white transition hover:bg-white/20"
          >
            <X size={19} />
          </button>
        </div>
      </div>

      {!chatStarted ? (
        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-6">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eeeaff] text-[#6650d9]">
              <MessageCircle size={28} />
            </div>

            <h2 className="mt-4 text-lg font-bold text-gray-900">
              Start a Conversation
            </h2>

            <p className="mt-2 text-xs leading-5 text-gray-500">
              Please share your details so our support team can assist you.
            </p>
          </div>

          <form onSubmit={handleStartChat} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-700">
                Your Name
              </label>

              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 focus-within:border-[#6650d9]">
                <UserRound size={17} className="text-gray-400" />

                <input
                  type="text"
                  name="name"
                  value={customer.name}
                  onChange={handleCustomerChange}
                  placeholder="Enter your name"
                  required
                  maxLength={60}
                  className="w-full py-3 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-700">
                Email Address
              </label>

              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 focus-within:border-[#6650d9]">
                <Mail size={17} className="text-gray-400" />

                <input
                  type="email"
                  name="email"
                  value={customer.email}
                  onChange={handleCustomerChange}
                  placeholder="Enter your email"
                  required
                  className="w-full py-3 text-sm outline-none"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isStartingChat}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6650d9] py-3 text-sm font-semibold text-white transition hover:bg-[#5540c0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStartingChat ? "Starting Chat..." : "Start Chat"}
              {!isStartingChat && <MessageCircle size={17} />}
            </button>
          </form>

          <p className="mt-5 text-center text-[10px] leading-5 text-gray-400">
            Your details will help our support team assist you better.
          </p>
        </div>
      ) : (
        <>
          {/* Customer Information */}
          <div className="border-b border-gray-100 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {customer.name}
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  {customer.email}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopVisitorTyping();
                  setChatStarted(false);
                }}
                className="flex items-center gap-1 text-xs font-medium text-[#6650d9]"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5">
            <div className="mb-2 text-center">
              <p className="text-xs text-gray-400">
                Welcome to BulkChat
              </p>

              <p className="mt-1 text-xs text-gray-400">
                Our support team is ready to help you.
              </p>
            </div>

            {messages.map((msg, index) => {
              const isCustomer = msg.sender === "customer";

              return (
                <div
                  key={msg.id || index}
                  className={`flex items-end gap-2 ${
                    isCustomer ? "justify-end" : "justify-start"
                  }`}
                >
                  {!isCustomer && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eeeaff] text-[#6650d9]">
                      <MessageCircle size={16} />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                      isCustomer
                        ? "rounded-br-sm bg-[#6650d9] text-white"
                        : "rounded-bl-sm border border-gray-100 bg-white text-gray-700"
                    }`}
                  >
                    <p className="break-words text-sm leading-5">
                      {msg.text}
                    </p>

                    <p
                      className={`mt-1 text-right text-[10px] ${
                        isCustomer
                          ? "text-purple-200"
                          : "text-gray-400"
                      }`}
                    >
                      {formatTime(msg.time)}
                    </p>
                  </div>
                </div>
              );
            })}

            {isAgentTyping && (
              <div className="flex items-end gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eeeaff] text-[#6650d9]">
                  <MessageCircle size={16} />
                </div>

                <div className="rounded-2xl rounded-bl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-medium text-gray-500">
                    Agent is typing...
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="border-t border-gray-200 bg-white p-3">
            {chatError && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {chatError}
              </p>
            )}

            <form
              onSubmit={handleSendMessage}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 transition focus-within:border-[#6650d9] focus-within:ring-2 focus-within:ring-[#6650d9]/10"
            >
              <input
                type="text"
                value={message}
                onChange={handleMessageChange}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                maxLength={5000}
                className="min-w-0 flex-1 bg-transparent py-1 text-sm text-gray-700 outline-none placeholder:text-gray-400"
              />

              <button
                type="submit"
                disabled={
                  !message.trim() ||
                  isSending ||
                  !isSocketConnected ||
                  !isConversationJoined
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#6650d9] text-white transition hover:bg-[#5540c0] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </form>

            <p className="mt-2 text-center text-[10px] text-gray-400">
              Powered by Customer
            </p>
          </div>
        </>
      )}
    </div>
  );
}


export default EmbeddedChatPage;
