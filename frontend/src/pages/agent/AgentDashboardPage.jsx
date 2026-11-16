
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  MessageCircle,
  LayoutDashboard,
  Users,
  Settings,
  UserCheck,
  UserX,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
  PanelsTopLeft,
  Inbox,
} from "lucide-react";

import api from "../../services/api";

function AgentDashboardPage() {
  const navigate = useNavigate();

  const [agent, setAgent] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError("");

      const [dashboardResponse, analyticsResponse] = await Promise.all([
        api.get("/agent/dashboard"),
        api.get("/agent/analytics"),
      ]);

      setAgent(dashboardResponse.data.agent);
      setAnalytics(analyticsResponse.data.analytics);
    } catch (err) {
      console.error("Dashboard API Error:", err);

      setError(
        err.response?.data?.message ||
          "Unable to load dashboard data. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const stats = [
    {
      title: "Total Visitors",
      value: analytics?.totalVisitors ?? 0,
      icon: <Users size={22} />,
      iconStyle: "bg-purple-100 text-[#6650d9]",
      description: "Visitors across your widgets",
    },
    {
      title: "Online Visitors",
      value: analytics?.onlineVisitors ?? 0,
      icon: <UserCheck size={22} />,
      iconStyle: "bg-green-100 text-green-600",
      description: "Currently online",
    },
    {
      title: "Offline Visitors",
      value: analytics?.offlineVisitors ?? 0,
      icon: <UserX size={22} />,
      iconStyle: "bg-gray-100 text-gray-500",
      description: "Currently offline",
    },
  ];

  return (
    <div className="flex min-h-screen bg-[#f8f9fc] text-gray-800">
      {/* Sidebar */}
      <aside className="flex w-[72px] shrink-0 flex-col items-center border-r border-gray-200 bg-white py-5">
        <div className="mb-10 flex h-11 w-11 items-center justify-center rounded-xl bg-[#6650d9] text-white">
          <MessageCircle size={24} />
        </div>

        <nav className="flex flex-1 flex-col gap-4">
          <SidebarIcon
            icon={<LayoutDashboard size={21} />}
            active
            label="Dashboard"
          />

          <SidebarIcon
            icon={<Users size={21} />}
            label="Visitors"
            onClick={() => navigate("/agent/visitors")}
          />

          <SidebarIcon
  icon={<PanelsTopLeft size={21} />}
  label="Widgets"
  onClick={() => navigate("/agent/widgets")}
/>
<SidebarIcon
  icon={<Inbox size={21} />}
  label="Inbox"
  onClick={() => navigate("/agent/inbox")}
/>
        </nav>

        <div className="flex flex-col gap-5">
          <SidebarIcon
            icon={<Settings size={21} />}
            label="Settings"
            onClick={() => navigate("/agent/settings")}
          />

          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eeeaff] font-bold text-[#6650d9]">
            {agent?.name?.charAt(0)?.toUpperCase() || "A"}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-5 sm:px-8">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Agent Dashboard
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Monitor your visitors and account activity.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </header>

        <div className="mx-auto max-w-7xl space-y-7 p-6 sm:p-8">
          {/* Error State */}
          {error && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">{error}</p>

              <button
                type="button"
                onClick={fetchDashboard}
                className="text-sm font-semibold text-red-700 underline"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Welcome Section */}
          <section className="rounded-2xl bg-gradient-to-r from-[#6650d9] to-[#8875ed] p-6 text-white shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div>
                <p className="text-sm font-medium text-purple-100">
                  WELCOME BACK
                </p>

                <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
                  {loading ? "Loading..." : agent?.name || "Agent"}
                </h2>

                <p className="mt-2 text-sm text-purple-100">
                  Welcome to your BulkChat agent workspace.
                </p>
              </div>

              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
                <ShieldCheck size={34} />
              </div>
            </div>
          </section>

          {/* Agent Information */}
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                Account Information
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Your registered agent details.
              </p>
            </div>

            <div className="grid gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-3">
              <InfoItem
                label="Agent Name"
                value={loading ? "Loading..." : agent?.name}
              />

              <InfoItem
                label="Email Address"
                value={loading ? "Loading..." : agent?.email}
              />

              <InfoItem
                label="Role"
                value={loading ? "Loading..." : agent?.role}
              />

              <InfoItem
                label="Account Status"
                value={
                  loading
                    ? "Loading..."
                    : agent
                      ? agent.isActive
                        ? "Active"
                        : "Inactive"
                      : "Not available"
                }
                status={agent?.isActive}
              />
            </div>
          </section>

          {/* Visitor Analytics */}
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                Visitor Analytics
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Overview of visitors tracked through your widgets.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.title}
                  className="rounded-xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.iconStyle}`}
                    >
                      {stat.icon}
                    </div>

                    <ArrowUpRight
                      size={19}
                      className="text-gray-300"
                    />
                  </div>

                  <p className="mt-5 text-sm font-medium text-gray-500">
                    {stat.title}
                  </p>

                  <h3 className="mt-1 text-3xl font-bold text-gray-900">
                    {loading ? "--" : stat.value}
                  </h3>

                  <p className="mt-2 text-xs text-gray-400">
                    {stat.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Quick Action */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-gray-900">
                  Manage Visitors
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  View visitor details, devices and browsing activity.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/agent/visitors")}
                className="flex items-center gap-2 rounded-lg bg-[#6650d9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5140b5]"
              >
                View Visitors
                <ArrowUpRight size={16} />
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function SidebarIcon({ icon, active = false, onClick, label }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${
        active
          ? "bg-[#eeeaff] text-[#6650d9]"
          : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      }`}
    >
      {icon}
    </button>
  );
}

function InfoItem({ label, value, status }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400">{label}</p>

      <div className="mt-2 flex items-center gap-2">
        {label === "Account Status" && (
          <span
            className={`h-2 w-2 rounded-full ${
              status ? "bg-green-500" : "bg-gray-400"
            }`}
          />
        )}

        <p className="break-all text-sm font-semibold capitalize text-gray-800">
          {value || "Not available"}
        </p>
      </div>
    </div>
  );
}

export default AgentDashboardPage;
