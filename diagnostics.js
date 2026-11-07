(function () {
  "use strict";

  const CONFIG = Object.assign({
    apiUrl: "",
    storageKey: "lostlink_ll_diag_v1",
    maxEvents: 300,
    maxMessageLength: 500
  }, window.LL_DIAG_CONFIG || {});

  const KEY = CONFIG.storageKey;
  const state = loadState();
  const startedAt = performance.now();

  function loadState() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        network: Array.isArray(value.network) ? value.network : [],
        errors: Array.isArray(value.errors) ? value.errors : [],
        tests: Array.isArray(value.tests) ? value.tests : [],
        pageChecks: Array.isArray(value.pageChecks) ? value.pageChecks : []
      };
    } catch (_) {
      return { network: [], errors: [], tests: [], pageChecks: [] };
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        network: state.network.slice(-CONFIG.maxEvents),
        errors: state.errors.slice(-CONFIG.maxEvents),
        tests: state.tests.slice(-100),
        pageChecks: state.pageChecks.slice(-100)
      }));
    } catch (error) {
      // Storage may be unavailable or full; do not break the host website.
      console.warn("[LL-DIAG] Could not save local diagnostics:", error);
    }
    try {
      renderIfDashboard();
    } catch (_) {}
  }

  function timeLabel(value) {
    return new Date(value || Date.now()).toLocaleTimeString();
  }

  function safeText(value) {
    return String(value == null ? "" : value)
      .replace(/https?:\/\/[^\s"'<>]+/gi, function (url) {
        try {
          const u = new URL(url);
          return u.origin + u.pathname;
        } catch (_) { return "[URL]"; }
      })
      .slice(0, CONFIG.maxMessageLength);
  }

  function safeUrl(input) {
    try {
      const u = new URL(input, location.href);
      const path = u.pathname.replace(
        /(\/macros\/s\/)[^/]+(\/exec\/?)/i,
        "$1[redacted]$2"
      );
      return u.origin + path; // Never persist query strings, fragments, or deployment IDs.
    } catch (_) {
      return "[unavailable URL]";
    }
  }

  function addNetwork(entry) {
    state.network.push(Object.assign({ time: Date.now() }, entry));
    state.network = state.network.slice(-CONFIG.maxEvents);
    persist();
  }

  function addError(type, message, source, line, column) {
    state.errors.push({
      time: Date.now(),
      type: safeText(type),
      message: safeText(message),
      source: source ? safeUrl(source) : "",
      line: Number(line) || 0,
      column: Number(column) || 0
    });
    state.errors = state.errors.slice(-CONFIG.maxEvents);
    persist();
  }

  // Capture JavaScript runtime errors and failed script/style/image resources.
  window.addEventListener("error", function (event) {
    try {
      if (event.target && event.target !== window) {
        const target = event.target;
        addError("Resource load", target.tagName + " failed to load", target.src || target.href, 0, 0);
        return;
      }
      addError("JavaScript", "JavaScript runtime error",
        event.filename, event.lineno, event.colno);
    } catch (_) {}
  }, true);

  window.addEventListener("unhandledrejection", function (event) {
    try {
      addError("Unhandled promise rejection", "Unhandled promise rejection");
    } catch (_) {}
  });

  // Capture console.error calls while preserving the browser's original console.
  const originalConsoleError = console.error.bind(console);
  try {
    console.error = function (...args) {
      try {
        addError("console.error", "console.error was called");
      } catch (_) {}
      originalConsoleError(...args);
    };
  } catch (_) {}

  // Observe fetch requests without changing their arguments or responses.
  if (window.fetch) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      let url = "";
      let method = "GET";
      try {
        url = typeof input === "string" ? input :
          input && input.url ? input.url : String(input);
        method = (init && init.method) ||
          (input && input.method) || "GET";
      } catch (_) {}
      const start = performance.now();

      return originalFetch(input, init).then(response => {
        try {
          addNetwork({
            method: String(method).toUpperCase(),
            url: safeUrl(url),
            status: response.status,
            ok: response.ok,
            durationMs: Math.round(performance.now() - start)
          });
        } catch (_) {}
        return response;
      }).catch(error => {
        try {
          addNetwork({
            method: String(method).toUpperCase(),
            url: safeUrl(url),
            status: "FAILED",
            ok: false,
            durationMs: Math.round(performance.now() - start)
          });
        } catch (_) {}
        throw error;
      });
    };
  }

  // Observe XMLHttpRequest without altering its behavior.
  if (window.XMLHttpRequest) {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        this.__llDiag = { method: String(method || "GET").toUpperCase(), url: safeUrl(url) };
      } catch (_) {}
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      const xhr = this;
      const start = performance.now();
      let recorded = false;
      function record() {
        if (recorded || xhr.readyState !== 4) return;
        recorded = true;
        try {
          addNetwork({
            method: xhr.__llDiag?.method || "GET",
            url: xhr.__llDiag?.url || "[unknown URL]",
            status: xhr.status || "FAILED",
            ok: xhr.status >= 200 && xhr.status < 400,
            durationMs: Math.round(performance.now() - start)
          });
        } catch (_) {}
      }
      try {
        xhr.addEventListener("readystatechange", record);
        xhr.addEventListener("error", record);
      } catch (_) {}
      return originalSend.apply(this, args);
    };
  }

  function getApiUrl() {
    const field = document.getElementById("apiUrl");
    const local = (() => {
      try { return localStorage.getItem(KEY + "_api") || ""; } catch (_) { return ""; }
    })();
    return (field && field.value.trim()) || local || CONFIG.apiUrl || "";
  }

  function validateApiUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        /script\.google\.com$/i.test(url.hostname) &&
        /\/macros\/s\/[^/]+\/exec\/?$/i.test(url.pathname);
    } catch (_) { return false; }
  }

  async function runEndpointTest(label, url) {
    const start = performance.now();
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error("API request failed");
      const data = await response.json();
      if (!data || data.success !== true) {
        throw new Error("API response did not contain success: true");
      }
      return {
        label, status: "PASS",
        detail: "HTTP " + response.status + " · " +
          Math.round(performance.now() - start) + " ms"
      };
    } catch (error) {
      return {
        label, status: "FAIL",
        detail: "Request failed; check network access, CORS, and the API response."
      };
    }
  }

  async function runConnectionTests() {
    const results = [];
    results.push({
      label: "Same-origin page",
      status: location.protocol === "http:" || location.protocol === "https:" ? "PASS" : "WARN",
      detail: location.origin
    });

    const api = getApiUrl();
    if (!validateApiUrl(api)) {
      results.push({
        label: "Apps Script API",
        status: "WARN",
        detail: "Enter a valid deployed Google Apps Script /exec URL to test API endpoints."
      });
      results.push({
        label: "Latest / Search / Translate",
        status: "SKIP",
        detail: "Skipped because the API URL is not configured."
      });
    } else {
      results.push(await runEndpointTest("Latest endpoint", api + "?action=latest&limit=1"));
      results.push(await runEndpointTest("Search endpoint", api + "?action=search&q=LLDIAG"));
      results.push(await runEndpointTest("Translation endpoint", api + "?action=translate&target=en&text=diagnostic"));
    }

    state.tests.push({ time: Date.now(), results });
    persist();
    renderTests(results);
    const failed = results.some(x => x.status === "FAIL");
    const passed = results.filter(x => x.status === "PASS").length;
    const overall = document.getElementById("overallStatus");
    if (overall) {
      overall.textContent = failed ? "ISSUES FOUND" : passed ? "TESTS PASSED" : "NEEDS CONFIG";
      overall.className = "pill " + (failed ? "bad" : passed ? "good" : "neutral");
    }
    return results;
  }

  async function runPageCheck() {
    const pathInput = document.getElementById("pagePath");
    const requestedPath = (pathInput && pathInput.value.trim()) || "/";
    let targetUrl;
    try {
      targetUrl = new URL(requestedPath, location.origin);
      if (targetUrl.origin !== location.origin) {
        throw new Error("Only pages on this same website can be inspected.");
      }
      targetUrl.search = "";
      targetUrl.hash = "";
    } catch (error) {
      renderPageChecks([{ label: "Page URL", status: "FAIL", detail: safeText(error.message) }]);
      return [];
    }

    renderPageChecks([{ label: "Page fetch", status: "WARN", detail: "Checking " + targetUrl.pathname + "…" }]);

    const checks = [];
    try {
      const response = await fetch(targetUrl.href, { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const htmlText = await response.text();
      const parsed = new DOMParser().parseFromString(htmlText, "text/html");

      checks.push({ label: "Page fetch", status: "PASS", detail: "HTTP " + response.status + " · " + targetUrl.pathname });
      checks.push({ label: "Document title", status: parsed.title ? "PASS" : "FAIL", detail: parsed.title || "Missing title" });
      checks.push({ label: "Viewport metadata", status: parsed.querySelector('meta[name="viewport"]') ? "PASS" : "WARN", detail: "Responsive viewport declaration" });

      const ids = Array.from(parsed.querySelectorAll("[id]")).map(el => el.id).filter(Boolean);
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
      checks.push({ label: "Duplicate element IDs", status: duplicates.length ? "WARN" : "PASS", detail: duplicates.length ? [...new Set(duplicates)].join(", ") : "None found" });

      const forms = parsed.forms.length;
      checks.push({ label: "Forms", status: forms ? "PASS" : "WARN", detail: forms + " form(s) detected" });

      const images = Array.from(parsed.images);
      const missingAlt = images.filter(img => !img.hasAttribute("alt"));
      checks.push({ label: "Image alt attributes", status: missingAlt.length ? "WARN" : "PASS", detail: missingAlt.length + " image(s) missing alt attributes" });

      const imageResults = await Promise.all(images.map(img => new Promise(resolve => {
        const src = img.getAttribute("src");
        if (!src || src.startsWith("data:")) {
          resolve({ ok: !!src, src: src ? "[embedded image]" : "[missing src]" });
          return;
        }
        let imageUrl;
        try {
          imageUrl = new URL(src, targetUrl.href);
        } catch (_) {
          resolve({ ok: false, src: "[invalid image URL]" });
          return;
        }
        const safeSource = safeUrl(imageUrl.href);
        const probe = new Image();
        const timer = setTimeout(() => resolve({ ok: false, src: safeSource }), 8000);
        probe.onload = () => { clearTimeout(timer); resolve({ ok: true, src: safeSource }); };
        probe.onerror = () => { clearTimeout(timer); resolve({ ok: false, src: safeSource }); };
        probe.src = imageUrl.href;
      })));
      const broken = imageResults.filter(x => !x.ok);
      checks.push({
        label: "Image loading",
        status: broken.length ? "FAIL" : "PASS",
        detail: images.length + " image(s) checked · " + broken.length + " failed" +
          (broken.length ? " · " + broken.slice(0, 3).map(x => x.src).join(", ") : "")
      });

      const scriptCount = parsed.scripts.length;
      checks.push({ label: "Script references", status: scriptCount ? "PASS" : "WARN", detail: scriptCount + " script element(s) found" });
      const diagInstalled = Array.from(parsed.scripts).some(s => /diagnostics\.js(?:[?#]|$)/i.test(s.src));
      checks.push({ label: "LL-DIAG instrumentation", status: diagInstalled ? "PASS" : "WARN", detail: diagInstalled ? "Diagnostic engine referenced" : "Not installed on this page; add the LL-DIAG script tags to capture its runtime activity" });
    } catch (error) {
      checks.push({ label: "Page fetch", status: "FAIL", detail: "Could not fetch or inspect the selected page." });
    }

    state.pageChecks.push({ time: Date.now(), page: targetUrl.pathname, checks });
    persist();
    renderPageChecks(checks);
    return checks;
  }

  function browserDetails() {
    const ua = navigator.userAgent || "Unavailable";
    const rows = [
      ["Browser", ua],
      ["Language", navigator.language || "Unavailable"],
      ["Platform", navigator.platform || "Unavailable"],
      ["Screen", screen.width + " × " + screen.height],
      ["Viewport", innerWidth + " × " + innerHeight],
      ["Online flag", navigator.onLine ? "Online" : "Offline"],
      ["Connection type", navigator.connection?.effectiveType || "Not exposed"],
      ["Cookies", navigator.cookieEnabled ? "Enabled" : "Disabled"],
      ["Storage", (() => { try { return typeof localStorage !== "undefined" ? "Available" : "Unavailable"; } catch (_) { return "Blocked"; } })()]
    ];
    return rows;
  }

  function performanceDetails() {
    const nav = performance.getEntriesByType("navigation")[0];
    if (!nav) return [["Page timing", "Not available"]];
    return [
      ["DOM interactive", Math.round(nav.domInteractive) + " ms"],
      ["DOM content loaded", Math.round(nav.domContentLoadedEventEnd) + " ms"],
      ["Load complete", Math.round(nav.loadEventEnd || performance.now()) + " ms"],
      ["DNS lookup", Math.round(nav.domainLookupEnd - nav.domainLookupStart) + " ms"],
      ["Server response", Math.round(nav.responseStart - nav.requestStart) + " ms"],
      ["Transfer size", nav.transferSize ? Math.round(nav.transferSize / 1024) + " KB" : "Unavailable / cached"]
    ];
  }

  function renderDetails(targetId, rows) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = rows.map(([key, value]) =>
      "<div class=\"detail-row\"><dt>" + escapeHtml(key) +
      "</dt><dd>" + escapeHtml(value) + "</dd></div>"
    ).join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function renderTests(results) {
    const target = document.getElementById("testResults");
    if (!target) return;
    target.innerHTML = results.map(item =>
      "<div class=\"test-row\"><div><strong>" + escapeHtml(item.label) +
      "</strong><small>" + escapeHtml(item.detail) +
      "</small></div><span class=\"status " + item.status.toLowerCase() +
      "\">" + item.status + "</span></div>"
    ).join("");
  }

  function renderPageChecks(checks) {
    const target = document.getElementById("pageResults");
    if (!target) return;
    target.innerHTML = checks.map(item =>
      "<div class=\"test-row\"><div><strong>" + escapeHtml(item.label) +
      "</strong><small>" + escapeHtml(item.detail) +
      "</small></div><span class=\"status " + item.status.toLowerCase() +
      "\">" + item.status + "</span></div>"
    ).join("");
  }

  function renderLogs() {
    const network = document.getElementById("networkRows");
    if (network) {
      const rows = state.network.slice().reverse();
      network.innerHTML = rows.length ? rows.map(item =>
        "<tr><td>" + escapeHtml(timeLabel(item.time)) +
        "</td><td>" + escapeHtml(item.method) +
        "</td><td class=\"url-cell\">" + escapeHtml(item.url) +
        "</td><td><span class=\"status " + (item.ok ? "pass" : "fail") +
        "\">" + escapeHtml(item.status) +
        "</span></td><td>" + escapeHtml(item.durationMs) + " ms</td></tr>"
      ).join("") : "<tr><td colspan=\"5\" class=\"empty\">No network events recorded.</td></tr>";
    }

    const errors = document.getElementById("errorRows");
    if (errors) {
      const rows = state.errors.slice().reverse();
      errors.innerHTML = rows.length ? rows.map(item =>
        "<article class=\"error-entry\"><div><strong>" + escapeHtml(item.type) +
        "</strong><time>" + escapeHtml(timeLabel(item.time)) +
        "</time></div><p>" + escapeHtml(item.message) +
        "</p><small>" + escapeHtml(item.source || "") +
        (item.line ? ":" + item.line + ":" + item.column : "") +
        "</small></article>"
      ).join("") : "<p class=\"empty\">No errors captured.</p>";
    }

    const networkCount = document.getElementById("networkCount");
    const errorCount = document.getElementById("errorCount");
    const imageCount = document.getElementById("imageCount");
    const errorBadge = document.getElementById("errorBadge");
    if (networkCount) networkCount.textContent = state.network.length;
    if (errorCount) errorCount.textContent = state.errors.length;
    if (errorBadge) errorBadge.textContent = state.errors.length + " errors";
    if (imageCount) imageCount.textContent = document.images ? Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc).length : 0;
  }

  function renderPerformance() {
    renderDetails("performanceInfo", performanceDetails());
    const nav = performance.getEntriesByType("navigation")[0];
    const el = document.getElementById("loadTime");
    if (el && nav) el.textContent = Math.round(nav.loadEventEnd || performance.now()) + " ms";
  }

  function renderIfDashboard() {
    if (!document.getElementById("networkRows")) return;
    renderLogs();
  }

  function exportReport(format) {
    const report = {
      product: "LostLink LL-DIAG",
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      page: location.origin + location.pathname,
      browser: browserDetails(),
      performance: performanceDetails(),
      summary: {
        networkEvents: state.network.length,
        capturedErrors: state.errors.length,
        lastTest: state.tests[state.tests.length - 1] || null
      },
      network: state.network,
      errors: state.errors,
      tests: state.tests,
      pageChecks: state.pageChecks
    };
    const content = format === "json" ? JSON.stringify(report, null, 2) :
      [
        "LOSTLINK LL-DIAG REPORT",
        "Exported: " + report.exportedAt,
        "Page: " + report.page,
        "",
        "SUMMARY",
        JSON.stringify(report.summary, null, 2),
        "",
        "NETWORK",
        ...state.network.map(x => `${new Date(x.time).toISOString()} ${x.method} ${x.url} ${x.status} ${x.durationMs}ms`),
        "",
        "ERRORS",
        ...state.errors.map(x => `${new Date(x.time).toISOString()} [${x.type}] ${x.message} ${x.source}:${x.line}:${x.column}`),
        "",
        "TESTS",
        JSON.stringify(state.tests, null, 2),
        "",
        "PAGE CHECKS",
        JSON.stringify(state.pageChecks, null, 2)
      ].join("\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "lostlink-diagnostics-" + new Date().toISOString().replace(/[:.]/g, "-") + "." + format;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function initDashboard() {
    if (!document.getElementById("runTests")) return;
    const apiInput = document.getElementById("apiUrl");
    try {
      apiInput.value = localStorage.getItem(KEY + "_api") || CONFIG.apiUrl || "";
    } catch (_) {}
    renderDetails("browserInfo", browserDetails());
    renderPerformance();
    renderLogs();

    document.getElementById("saveApi").addEventListener("click", function () {
      const value = apiInput.value.trim();
      if (!validateApiUrl(value)) {
        alert("Please enter a valid deployed Google Apps Script /exec URL.");
        return;
      }
      try {
        localStorage.setItem(KEY + "_api", value);
      } catch (_) {
        alert("Could not save the API URL in this browser. You can still run tests with the entered URL.");
        return;
      }
      alert("API URL saved in this browser.");
    });
    document.getElementById("runTests").addEventListener("click", runConnectionTests);
    document.getElementById("checkPage").addEventListener("click", runPageCheck);
    document.getElementById("refreshPerformance").addEventListener("click", renderPerformance);
    document.getElementById("clearLogs").addEventListener("click", function () {
      if (!confirm("Clear all LL-DIAG logs stored in this browser?")) return;
      state.network = [];
      state.errors = [];
      state.tests = [];
      state.pageChecks = [];
      persist();
      const results = document.getElementById("testResults");
      const page = document.getElementById("pageResults");
      if (results) results.innerHTML = "<p class=\"empty\">No tests run.</p>";
      if (page) page.innerHTML = "<p class=\"empty\">No page checks run.</p>";
    });
    document.getElementById("exportJson").addEventListener("click", () => exportReport("json"));
    document.getElementById("exportTxt").addEventListener("click", () => exportReport("txt"));
  }

  window.LLDiag = {
    log: () => addError("Application", "Application diagnostic event"),
    runConnectionTests,
    runPageCheck,
    getSummary: () => ({
      networkEvents: state.network.length,
      errors: state.errors.length
    })
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboard, { once: true });
  } else {
    initDashboard();
  }
})();
