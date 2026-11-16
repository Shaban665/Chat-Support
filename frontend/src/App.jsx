
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";

import SupportPage from "./pages/support/SupportPage";
import EmbeddedChatPage from "./pages/support/EmbeddedChatPage";

import AgentDashboardPage from "./pages/agent/AgentDashboardPage";
import AgentVisitorsPage from "./pages/agent/AgentVisitorsPage";
import AgentSettingsPage from "./pages/agent/AgentSettingsPage";
import AgentWidgetsPage from "./pages/agent/AgentWidgetsPage";
import AgentInboxPage from "./pages/agent/AgentInboxPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/support" replace />} />

        {/* Authentication */}
        <Route path="/agent/login" element={<LoginPage />} />
        <Route path="/agent/register" element={<RegisterPage />} />

        <Route path="/login" element={<Navigate to="/agent/login" replace />} />
        <Route path="/register" element={<Navigate to="/agent/register" replace />} />

        {/* Support */}
        <Route path="/support" element={<SupportPage />} />

        {/* Existing embedded chat route */}
        <Route path="/embed/chat" element={<EmbeddedChatPage />} />

        {/* Dynamic website widget route */}
        <Route
          path="/widget/:publicKey"
          element={<EmbeddedChatPage />}
        />

        {/* Agent Dashboard */}
        <Route path="/agent/dashboard" element={<AgentDashboardPage />} />
        <Route path="/agent/visitors" element={<AgentVisitorsPage />} />
        <Route path="/agent/widgets" element={<AgentWidgetsPage />} />
        <Route path="/agent/inbox" element={<AgentInboxPage />} />
        <Route path="/agent/settings" element={<AgentSettingsPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/support" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
