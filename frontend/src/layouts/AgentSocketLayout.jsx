
import { useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import {
  AgentSocketProvider,
  useAgentSocket,
} from "../context/AgentSocketContext";

import AgentNotificationBell from "../pages/agent/AgentNotificationBell";

function AgentGlobalNotifications() {
  const socket = useAgentSocket();
  const navigate = useNavigate();

  const handleOpenConversation = useCallback(
    (notification) => {
      navigate("/agent/inbox", {
        state: { notification },
      });
    },
    [navigate]
  );

  return (
    <div className="fixed right-4 top-4 z-[100]">
      <AgentNotificationBell
        socket={socket}
        onOpenConversation={handleOpenConversation}
      />
    </div>
  );
}

function AgentSocketLayout() {
  return (
    <AgentSocketProvider>
      <Outlet />
      <AgentGlobalNotifications />
    </AgentSocketProvider>
  );
}

export default AgentSocketLayout;
