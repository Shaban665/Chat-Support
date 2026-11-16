
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { connectAgentSocket } from "../services/socket";

const AgentSocketContext = createContext(null);

export function AgentSocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Create one shared Agent socket connection
    const agentSocket = connectAgentSocket();

    setSocket(agentSocket);

    agentSocket.connect();

    console.log("Shared Agent Socket Initialized");

    return () => {
      console.log("Shared Agent Socket Disconnected");

      agentSocket.disconnect();
      setSocket(null);
    };
  }, []);

  return (
    <AgentSocketContext.Provider value={socket}>
      {children}
    </AgentSocketContext.Provider>
  );
}

export function useAgentSocket() {
  return useContext(AgentSocketContext);
}
