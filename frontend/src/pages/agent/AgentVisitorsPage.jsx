
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Users,
  Circle,
  Monitor,
  Globe,
  MoreHorizontal,
  MessageCircle,
  ArrowUpRight,
  X,
  RefreshCw,
  ExternalLink,
  Building2,
} from "lucide-react";

import api from "../../services/api";
import { connectAgentSocket } from "../../services/socket";

const avatarColors = [
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
];

const formatDeviceInfo = (value) => {
  if (!value) return "Unknown";

  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const name = value.name || "";
    const version = value.version || "";

    return [name, version].filter(Boolean).join(" ") || "Unknown";
  }

  return String(value);
};

const getInitials = (name) => {
  if (!name || name === "Anonymous Visitor") return "AV";

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
};

const getRelativeTime = (date) => {
  if (!date) return "Unknown";

  const timestamp = new Date(date).getTime();

  if (Number.isNaN(timestamp)) return "Unknown";

  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);

  return `${days} day${days > 1 ? "s" : ""} ago`;
};

const formatCurrentPage = (url) => {
  if (!url) return "Unknown";

  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};

const mapVisitor = (visitor, index) => {
  const name = visitor.name?.trim() || "Anonymous Visitor";

  return {
    ...visitor,

    mongoId: visitor._id,
    id: visitor.visitorId || visitor._id,

    name,
    email: visitor.email || "No email provided",

    browser: formatDeviceInfo(visitor.browser),
    os: formatDeviceInfo(visitor.operatingSystem),
    device: formatDeviceInfo(visitor.device),

    page: formatCurrentPage(visitor.currentPage),

    location: visitor.location || visitor.country || "Unknown",

    time: getRelativeTime(visitor.lastSeen),

    status: visitor.isOnline ? "Online" : "Offline",

    widgetId: visitor.widget?._id || visitor.widget,
    widgetName: visitor.widget?.name || "Unknown Website",
    websiteUrl: visitor.widget?.websiteUrl || "",

    initials: getInitials(name),
    color: avatarColors[index % avatarColors.length],
  };
};

function AgentVisitorsPage() {
  const navigate = useNavigate();

  const [visitors, setVisitors] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [widgetFilter, setWidgetFilter] = useState("All");
  const [selectedVisitor, setSelectedVisitor] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startingConversation, setStartingConversation] = useState(false);

  // Fetch visitors
  const fetchVisitors = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      setError("");

      const response = await api.get("/visitors");

      const visitorData = response.data?.visitors || [];

      const formattedVisitors = visitorData.map(mapVisitor);

      setVisitors(formattedVisitors);

      setSelectedVisitor((previous) => {
        if (!previous) return null;

        return (
          formattedVisitors.find(
            (visitor) => visitor.mongoId === previous.mongoId
          ) || null
        );
      });
    } catch (err) {
      console.error("Visitors fetch error:", err);

      if (showLoader) {
        setError(
          err.response?.data?.message ||
            "Unable to load visitors. Please try again."
        );
      }
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchVisitors();

    const interval = setInterval(() => {
      fetchVisitors(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchVisitors]);

  // Agent Socket.IO connection for live visitor status
  useEffect(() => {
    const socket = connectAgentSocket();

    socket.on("visitor_status", (data) => {
      if (!data?.visitorDbId) return;

      setVisitors((previous) =>
        previous.map((visitor) => {
          if (visitor.mongoId !== data.visitorDbId) {
            return visitor;
          }

          // Ensure the event belongs to the same widget
          if (
            visitor.widgetId &&
            data.widgetId &&
            visitor.widgetId.toString() !== data.widgetId.toString()
          ) {
            return visitor;
          }

          const updatedVisitor = {
            ...visitor,
            isOnline: Boolean(data.isOnline),
            status: data.isOnline ? "Online" : "Offline",
            lastSeen: data.lastSeen || visitor.lastSeen,
            time: getRelativeTime(data.lastSeen || visitor.lastSeen),
          };

          return updatedVisitor;
        })
      );

      setSelectedVisitor((previous) => {
        if (!previous || previous.mongoId !== data.visitorDbId) {
          return previous;
        }

        if (
          previous.widgetId &&
          data.widgetId &&
          previous.widgetId.toString() !== data.widgetId.toString()
        ) {
          return previous;
        }

        return {
          ...previous,
          isOnline: Boolean(data.isOnline),
          status: data.isOnline ? "Online" : "Offline",
          lastSeen: data.lastSeen || previous.lastSeen,
          time: getRelativeTime(data.lastSeen || previous.lastSeen),
        };
      });
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  // Update relative time labels periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setVisitors((previous) =>
        previous.map((visitor) => ({
          ...visitor,
          time: getRelativeTime(visitor.lastSeen),
        }))
      );

      setSelectedVisitor((previous) =>
        previous
          ? {
              ...previous,
              time: getRelativeTime(previous.lastSeen),
            }
          : null
      );
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Unique widgets owned by this agent
  const widgets = useMemo(() => {
    const widgetMap = new Map();

    visitors.forEach((visitor) => {
      if (!visitor.widgetId) return;

      const id = visitor.widgetId.toString();

      if (!widgetMap.has(id)) {
        widgetMap.set(id, {
          id,
          name: visitor.widgetName,
        });
      }
    });

    return Array.from(widgetMap.values());
  }, [visitors]);

  // Search and filters
  const filteredVisitors = visitors.filter((visitor) => {
    const searchValue = search.toLowerCase();

    const matchesSearch =
      visitor.name.toLowerCase().includes(searchValue) ||
      visitor.id.toLowerCase().includes(searchValue) ||
      visitor.browser.toLowerCase().includes(searchValue) ||
      visitor.email.toLowerCase().includes(searchValue) ||
      visitor.widgetName.toLowerCase().includes(searchValue);

    const matchesStatus =
      filter === "All" || visitor.status === filter;

    const matchesWidget =
      widgetFilter === "All" ||
      visitor.widgetId?.toString() === widgetFilter;

    return matchesSearch && matchesStatus && matchesWidget;
  });

  const onlineCount = visitors.filter(
    (visitor) => visitor.status === "Online"
  ).length;

  const selectedWidgetName = selectedVisitor?.widgetName || "Unknown Website";

  // Start or get conversation for selected visitor
  const startConversation = async () => {
    if (!selectedVisitor?.mongoId || startingConversation) return;

    try {
      setStartingConversation(true);

      const response = await api.post("/chat/agent/conversation", {
        visitorDbId: selectedVisitor.mongoId,
      });

      const conversation = response.data?.conversation;

      if (!conversation?._id) {
        throw new Error("Invalid conversation response from server");
      }

      navigate("/agent/inbox", {
        state: {
          visitor: selectedVisitor,
          conversation,
        },
      });
    } catch (err) {
      console.error("Start conversation error:", err);

      const message =
        err.response?.data?.message ||
        err.message ||
        "Unable to start conversation. Please try again.";

      window.alert(message);
    } finally {
      setStartingConversation(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            All Visitors
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Monitor visitors across all your connected websites.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchVisitors()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>

          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />

            <span className="text-sm font-semibold text-gray-700">
              {onlineCount} Online
            </span>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Visitors"
          value={visitors.length}
          icon={<Users size={20} />}
        />

        <StatCard
          title="Online Visitors"
          value={onlineCount}
          icon={<Circle size={19} />}
        />

        <StatCard
          title="Offline Visitors"
          value={visitors.length - onlineCount}
          icon={<Globe size={20} />}
        />
      </div>

      {/* Visitors Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 p-5">
          <div>
            <h2 className="font-bold text-gray-900">
              Website Visitors
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Visitor activity and device information
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
              <Search size={16} className="text-gray-400" />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search visitors..."
                className="w-40 text-sm outline-none"
              />
            </div>

            {/* Widget Filter */}
            <select
              value={widgetFilter}
              onChange={(e) => setWidgetFilter(e.target.value)}
              className="max-w-[190px] rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none"
            >
              <option value="All">All Websites</option>

              {widgets.map((widget) => (
                <option key={widget.id} value={widget.id}>
                  {widget.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none"
            >
              <option value="All">All Status</option>
              <option value="Online">Online</option>
              <option value="Offline">Offline</option>
            </select>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="py-16 text-center">
            <RefreshCw
              size={28}
              className="mx-auto animate-spin text-[#6650d9]"
            />

            <p className="mt-3 text-sm text-gray-500">
              Loading visitors...
            </p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-semibold text-red-500">
              {error}
            </p>

            <button
              type="button"
              onClick={() => fetchVisitors()}
              className="mt-4 rounded-xl bg-[#6650d9] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#5140b5]"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-5 py-4 font-semibold">Visitor</th>
                  <th className="px-5 py-4 font-semibold">Website</th>
                  <th className="px-5 py-4 font-semibold">Browser ID</th>
                  <th className="px-5 py-4 font-semibold">Browser / OS</th>
                  <th className="px-5 py-4 font-semibold">Current Page</th>
                  <th className="px-5 py-4 font-semibold">Last Seen</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {filteredVisitors.map((visitor) => (
                  <tr
                    key={visitor.mongoId}
                    onClick={() => setSelectedVisitor(visitor)}
                    className="cursor-pointer transition hover:bg-[#f8f6ff]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${visitor.color}`}
                        >
                          {visitor.initials}
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {visitor.name}
                          </p>

                          <p className="mt-1 text-xs text-gray-400">
                            {visitor.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 size={15} className="text-gray-400" />

                        <div>
                          <p className="text-xs font-semibold text-gray-700">
                            {visitor.widgetName}
                          </p>

                          {visitor.websiteUrl && (
                            <p className="mt-1 max-w-[150px] truncate text-xs text-gray-400">
                              {visitor.websiteUrl}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-xs font-medium text-gray-600">
                      {visitor.id}
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-xs font-semibold text-gray-700">
                        {visitor.browser}
                      </p>

                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <Monitor size={12} />
                        {visitor.os} · {visitor.device}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-600">
                        {visitor.page}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-xs text-gray-500">
                      {visitor.time}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          visitor.status === "Online"
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <Circle size={7} className="fill-current" />
                        {visitor.status}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        title="View visitor details"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVisitor(visitor);
                        }}
                        className="rounded-lg bg-[#eeeaff] p-2 text-[#6650d9] transition hover:bg-[#6650d9] hover:text-white"
                      >
                        <MessageCircle size={17} />
                      </button>

                      <button
                        type="button"
                        title="Open website"
                        disabled={!visitor.websiteUrl}
                        onClick={(e) => {
                          e.stopPropagation();

                          if (visitor.websiteUrl) {
                            window.open(
                              visitor.websiteUrl,
                              "_blank",
                              "noopener,noreferrer"
                            );
                          }
                        }}
                        className="ml-2 rounded-lg p-2 text-gray-400 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ExternalLink size={16} />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredVisitors.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-5 py-12 text-center">
                      <Users
                        className="mx-auto mb-3 text-gray-300"
                        size={30}
                      />

                      <p className="text-sm font-semibold text-gray-600">
                        No visitors found
                      </p>

                      <p className="mt-1 text-xs text-gray-400">
                        Try changing your search or filters.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
          <p className="text-xs text-gray-400">
            Showing {filteredVisitors.length} of {visitors.length} visitors
          </p>

          <span className="flex items-center gap-1 text-xs text-green-600">
            <Circle size={7} className="fill-current" />
            Live updates enabled
            <ArrowUpRight size={13} />
          </span>
        </div>
      </div>

      {/* Visitor Details Modal */}
      {selectedVisitor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedVisitor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Visitor Details
              </h2>

              <button
                type="button"
                onClick={() => setSelectedVisitor(null)}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* Visitor Profile */}
            <div className="mt-6 flex items-center gap-3">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold ${selectedVisitor.color}`}
              >
                {selectedVisitor.initials}
              </div>

              <div>
                <h3 className="font-bold text-gray-900">
                  {selectedVisitor.name}
                </h3>

                <p className="text-sm text-gray-500">
                  {selectedVisitor.email}
                </p>

                <span
                  className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${
                    selectedVisitor.status === "Online"
                      ? "text-green-600"
                      : "text-gray-400"
                  }`}
                >
                  <Circle size={7} className="fill-current" />
                  {selectedVisitor.status}
                </span>
              </div>
            </div>

            {/* Website Information */}
            <div className="mt-6 rounded-xl bg-purple-50 p-4">
              <div className="flex items-center gap-2 text-[#6650d9]">
                <Building2 size={17} />

                <span className="text-xs font-bold uppercase tracking-wide">
                  Website
                </span>
              </div>

              <p className="mt-2 text-sm font-semibold text-gray-800">
                {selectedWidgetName}
              </p>

              {selectedVisitor.websiteUrl && (
                <p className="mt-1 break-all text-xs text-gray-500">
                  {selectedVisitor.websiteUrl}
                </p>
              )}
            </div>

            {/* Visitor Information */}
            <div className="mt-6 border-t border-gray-100 pt-5">
              <h3 className="mb-5 text-xs font-bold uppercase tracking-wider text-gray-400">
                Visitor Information
              </h3>

              <div className="space-y-4">
                <VisitorDetail label="Browser ID" value={selectedVisitor.id} />
                <VisitorDetail label="Browser" value={selectedVisitor.browser} />
                <VisitorDetail label="Operating System" value={selectedVisitor.os} />
                <VisitorDetail label="Device" value={selectedVisitor.device} />
                <VisitorDetail label="Current Page" value={selectedVisitor.page} />
                <VisitorDetail label="Location" value={selectedVisitor.location} />
                <VisitorDetail label="Last Seen" value={selectedVisitor.time} />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedVisitor(null)}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                Close
              </button>

              <button
                type="button"
                onClick={startConversation}
                disabled={startingConversation}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#6650d9] py-3 text-sm font-semibold text-white transition hover:bg-[#5140b5] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {startingConversation ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <MessageCircle size={16} />
                    Start Conversation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VisitorDetail({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-gray-400">{label}</span>

      <span className="break-all text-right text-sm font-semibold text-gray-700">
        {value || "Unknown"}
      </span>
    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm text-gray-500">{title}</p>

        <h3 className="mt-2 text-2xl font-bold text-gray-900">
          {value}
        </h3>
      </div>

      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eeeaff] text-[#6650d9]">
        {icon}
      </div>
    </div>
  );
}

export default AgentVisitorsPage;
