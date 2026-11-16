
import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

// Visitor socket connection
export const connectVisitorSocket = (
  publicKey,
  visitorId,
  parentOrigin,
  currentPage
) => {
  return io(SOCKET_URL, {
    autoConnect: false,

    auth: {
      role: "visitor",
      publicKey,
      visitorId,
      parentOrigin,
      currentPage,
    },

    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
  });
};

// Agent socket connection
export const connectAgentSocket = () => {
  return io(SOCKET_URL, {
    autoConnect: false,

    auth: {
      role: "agent",
    },

    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
  });
};
