
(function () {
  "use strict";

  // Get the script element
  const script = document.currentScript;

  if (!script) {
    console.error("BulkChat: Installation script not found.");
    return;
  }

  // Prevent duplicate widget initialization
  if (script.dataset.bulkchatLoaded === "true") {
    return;
  }

  script.dataset.bulkchatLoaded = "true";

  // Get widget public key
  const publicKey = script.getAttribute("data-widget-key");

  if (!publicKey) {
    console.error("BulkChat: data-widget-key is required.");
    return;
  }

  // Get BulkChat frontend URL from script source
  const widgetBase = new URL(script.src).origin;

  // Prevent duplicate installation
  if (document.getElementById("bulkchat-widget-container")) {
    return;
  }

  // Create widget container
  const container = document.createElement("div");

  container.id = "bulkchat-widget-container";

  Object.assign(container.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "2147483000",
    fontFamily: "Arial, sans-serif",
  });

  // Create chat button
  const button = document.createElement("button");

  button.type = "button";
  button.setAttribute("aria-label", "Open support chat");
  button.setAttribute("aria-expanded", "false");

  button.innerHTML = `
    <svg
      width="27"
      height="27"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>
    </svg>
  `;

  Object.assign(button.style, {
    width: "60px",
    height: "60px",
    border: "none",
    borderRadius: "50%",
    background: "#6650d9",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 5px 20px rgba(0,0,0,0.2)",
    transition: "transform 0.2s ease, background 0.2s ease",
  });

  button.addEventListener("mouseenter", () => {
    button.style.transform = "scale(1.07)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.transform = "scale(1)";
  });

  // Create iframe
  const iframe = document.createElement("iframe");

  iframe.src = `${widgetBase}/widget/${encodeURIComponent(publicKey)}`;

  iframe.title = "BulkChat Customer Support";
  iframe.setAttribute("allow", "clipboard-write");

  Object.assign(iframe.style, {
    position: "absolute",
    bottom: "75px",
    right: "0",
    width: "380px",
    height: "600px",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "calc(100vh - 120px)",
    border: "none",
    borderRadius: "18px",
    background: "#ffffff",
    boxShadow: "0 8px 35px rgba(0,0,0,0.18)",
    display: "none",
  });

  // Send parent website information to iframe
  const sendParentInfo = () => {
    if (!iframe.contentWindow) return;

    iframe.contentWindow.postMessage(
      {
        type: "BULKCHAT_PARENT_INFO",
        currentPage: window.location.href,
        referrer: document.referrer || "",
      },
      widgetBase
    );
  };

  // Send information whenever iframe loads
  iframe.addEventListener("load", sendParentInfo);

  // Open / close widget
  let isOpen = false;

  const updateWidgetVisibility = (open) => {
    isOpen = open;

    iframe.style.display = isOpen ? "block" : "none";

    button.setAttribute("aria-expanded", String(isOpen));
    button.setAttribute(
      "aria-label",
      isOpen ? "Close support chat" : "Open support chat"
    );

    button.innerHTML = isOpen
      ? `
        <svg
          width="25"
          height="25"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      `
      : `
        <svg
          width="27"
          height="27"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>
        </svg>
      `;

    if (isOpen) {
      sendParentInfo();
    }
  };

  button.addEventListener("click", () => {
    updateWidgetVisibility(!isOpen);
  });

  // Receive close requests from iframe
  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    if (event.origin !== widgetBase) return;

    if (event.data?.type === "BULKCHAT_CLOSE") {
      updateWidgetVisibility(false);
    }
  });

  // Update iframe page information when parent page changes
  const handlePageChange = () => {
    sendParentInfo();
  };

  window.addEventListener("popstate", handlePageChange);
  window.addEventListener("hashchange", handlePageChange);

  // Support SPA navigation through History API
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    handlePageChange();
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    handlePageChange();
    return result;
  };

  // Add elements to website
  container.appendChild(iframe);
  container.appendChild(button);

  document.body.appendChild(container);

  // Mobile responsive layout
  const style = document.createElement("style");

  style.textContent = `
    @media screen and (max-width: 480px) {
      #bulkchat-widget-container {
        right: 16px !important;
        bottom: 16px !important;
      }

      #bulkchat-widget-container iframe {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100dvh !important;
        max-width: 100vw !important;
        max-height: 100dvh !important;
        border-radius: 0 !important;
        z-index: 2147483000 !important;
      }
    }
  `;

  document.head.appendChild(style);

  console.log("BulkChat widget initialized successfully.");
})();
