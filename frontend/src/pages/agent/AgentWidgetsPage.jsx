
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle,
  LayoutDashboard,
  Users,
  Settings,
  PanelsTopLeft,
  Globe,
  Plus,
  Copy,
  Check,
  ArrowLeft,
  LoaderCircle,
  AlertCircle,
  CheckCircle2,
  Code,
} from "lucide-react";

import api from "../../services/api";

function AgentWidgetsPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    websiteUrl: "",
    allowedDomains: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdWidget, setCreatedWidget] = useState(null);
  const [copied, setCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  // Generate installation script for the created widget
  const widgetBaseUrl =
    import.meta.env.VITE_WIDGET_BASE_URL || window.location.origin;

  const installationCode = createdWidget?.publicKey
    ? `<script
  src="${widgetBaseUrl}/widget.js"
  data-widget-key="${createdWidget.publicKey}"
  async
></script>`
    : "";

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setCreatedWidget(null);
    setCopied(false);
    setKeyCopied(false);

    const allowedDomains = formData.allowedDomains
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean);

    try {
      setLoading(true);

      const response = await api.post("/widgets", {
        name: formData.name.trim(),
        websiteUrl: formData.websiteUrl.trim(),
        allowedDomains,
      });

      setCreatedWidget(response.data.widget);

      setFormData({
        name: "",
        websiteUrl: "",
        allowedDomains: "",
      });
    } catch (err) {
      console.error("Create Widget Error:", err);

      setError(
        err.response?.data?.message ||
          "Unable to create widget. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInstallation = async () => {
    if (!installationCode) return;

    try {
      await navigator.clipboard.writeText(installationCode);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setError(
        "Unable to copy installation code. Please copy it manually."
      );
    }
  };

  const handleCopyKey = async () => {
    if (!createdWidget?.publicKey) return;

    try {
      await navigator.clipboard.writeText(createdWidget.publicKey);

      setKeyCopied(true);

      setTimeout(() => {
        setKeyCopied(false);
      }, 2000);
    } catch {
      setError("Unable to copy Public Key. Please copy it manually.");
    }
  };

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
            label="Dashboard"
            onClick={() => navigate("/agent/dashboard")}
          />

          <SidebarIcon
            icon={<Users size={21} />}
            label="Visitors"
            onClick={() => navigate("/agent/visitors")}
          />

          <SidebarIcon
            icon={<PanelsTopLeft size={21} />}
            label="Widgets"
            active
          />
        </nav>

        <div className="flex flex-col gap-5">
          <SidebarIcon
            icon={<Settings size={21} />}
            label="Settings"
            onClick={() => navigate("/agent/settings")}
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-5 sm:px-8">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Widget Management
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Create and install a chat widget on your website.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/agent/dashboard")}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <ArrowLeft size={16} />
            Dashboard
          </button>
        </header>

        <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
          {/* Introduction */}
          <section className="rounded-2xl bg-gradient-to-r from-[#6650d9] to-[#8875ed] p-6 text-white shadow-sm sm:p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Globe size={29} />
              </div>

              <div>
                <h2 className="text-xl font-bold sm:text-2xl">
                  Connect Your Website
                </h2>

                <p className="mt-2 text-sm leading-6 text-purple-100">
                  Create a unique BulkChat widget and install it
                  on your website using a simple script.
                </p>
              </div>
            </div>
          </section>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <AlertCircle
                size={19}
                className="mt-0.5 shrink-0 text-red-600"
              />

              <p className="text-sm font-medium text-red-700">
                {error}
              </p>
            </div>
          )}

          {/* Success + Installation Code */}
          {createdWidget && (
            <section className="rounded-2xl border border-green-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  size={23}
                  className="shrink-0 text-green-600"
                />

                <div>
                  <h2 className="font-bold text-gray-900">
                    Widget Created Successfully!
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Your widget "{createdWidget.name}" is ready
                    for installation.
                  </p>
                </div>
              </div>

              {/* Public Key */}
              <div className="mt-5 rounded-xl bg-gray-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Widget Public Key
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <code className="min-w-0 flex-1 break-all text-sm text-gray-800">
                    {createdWidget.publicKey}
                  </code>

                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                  >
                    {keyCopied ? (
                      <Check size={16} />
                    ) : (
                      <Copy size={16} />
                    )}

                    {keyCopied ? "Copied" : "Copy Key"}
                  </button>
                </div>
              </div>

              {/* Installation Instructions */}
              <div className="mt-6">
                <div className="mb-3 flex items-center gap-2">
                  <Code size={19} className="text-[#6650d9]" />

                  <h3 className="font-bold text-gray-900">
                    Website Installation Code
                  </h3>
                </div>

                <p className="mb-3 text-sm leading-6 text-gray-500">
                  Copy this code and paste it before the closing
                  <code className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
                    &lt;/body&gt;
                  </code>
                  tag of your website.
                </p>

                <div className="overflow-hidden rounded-xl bg-[#171923]">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <span className="text-xs font-medium text-gray-400">
                      HTML Installation Script
                    </span>

                    <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                      HTML
                    </span>
                  </div>

                  <pre className="overflow-x-auto p-4 text-sm leading-7 text-purple-200">
                    <code>{installationCode}</code>
                  </pre>
                </div>

                <button
                  type="button"
                  onClick={handleCopyInstallation}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#6650d9] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#5140b5]"
                >
                  {copied ? (
                    <Check size={17} />
                  ) : (
                    <Copy size={17} />
                  )}

                  {copied
                    ? "Installation Code Copied!"
                    : "Copy Installation Code"}
                </button>
              </div>

              <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs leading-5 text-blue-800">
                  <strong>Next:</strong> Paste the copied script into
                  your website's HTML and refresh your website.
                  Your BulkChat chat button should appear.
                </p>
              </div>
            </section>
          )}

          {/* Create Widget Form */}
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 p-5 sm:p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eeeaff] text-[#6650d9]">
                <Plus size={22} />
              </div>

              <div>
                <h2 className="font-bold text-gray-900">
                  Create New Widget
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  Enter your website details below.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
              {/* Widget Name */}
              <div>
                <label
                  htmlFor="name"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Widget Name <span className="text-red-500">*</span>
                </label>

                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="My Website Chat"
                  maxLength={100}
                  required
                  disabled={loading}
                  className="h-12 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#6650d9] focus:ring-4 focus:ring-[#6650d9]/10 disabled:bg-gray-50"
                />

                <p className="mt-1.5 text-xs text-gray-400">
                  Maximum 100 characters.
                </p>
              </div>

              {/* Website URL */}
              <div>
                <label
                  htmlFor="websiteUrl"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Website URL <span className="text-red-500">*</span>
                </label>

                <input
                  id="websiteUrl"
                  name="websiteUrl"
                  type="url"
                  value={formData.websiteUrl}
                  onChange={handleChange}
                  placeholder="https://mywebsite.com"
                  required
                  disabled={loading}
                  className="h-12 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#6650d9] focus:ring-4 focus:ring-[#6650d9]/10 disabled:bg-gray-50"
                />

                <p className="mt-1.5 text-xs text-gray-400">
                  Enter a valid HTTP or HTTPS website URL.
                </p>
              </div>

              {/* Allowed Domains */}
              <div>
                <label
                  htmlFor="allowedDomains"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Allowed Domains
                  <span className="ml-2 font-normal text-gray-400">
                    (Optional)
                  </span>
                </label>

                <input
                  id="allowedDomains"
                  name="allowedDomains"
                  type="text"
                  value={formData.allowedDomains}
                  onChange={handleChange}
                  placeholder="mywebsite.com, www.mywebsite.com"
                  disabled={loading}
                  className="h-12 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#6650d9] focus:ring-4 focus:ring-[#6650d9]/10 disabled:bg-gray-50"
                />

                <p className="mt-1.5 text-xs text-gray-400">
                  Separate multiple domains with commas. Enter
                  hostnames only, without https:// or paths.
                  Leave blank to use the website domain automatically.
                </p>
              </div>

              {/* Submit */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 pt-5">
                <p className="text-xs text-gray-400">
                  Your Public Key will be generated automatically.
                </p>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#6650d9] px-6 text-sm font-semibold text-white transition hover:bg-[#5140b5] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={17} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={17} />
                      Create Widget
                    </>
                  )}
                </button>
              </div>
            </form>
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
      aria-label={label}
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

export default AgentWidgetsPage;
