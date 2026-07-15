/** Extra init scripts to reduce automation fingerprints in Chromium. */
export function stealthInitScript(languages: string[]): string {
  return `
(() => {
  const langs = ${JSON.stringify(languages)};

  Object.defineProperty(navigator, "webdriver", { get: () => undefined });

  Object.defineProperty(navigator, "languages", { get: () => langs });
  Object.defineProperty(navigator, "language", { get: () => langs[0] ?? "en-US" });

  Object.defineProperty(navigator, "plugins", {
    get: () => [
      { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
      { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" },
      { name: "Native Client", filename: "internal-nacl-plugin", description: "" },
    ],
  });

  Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
  Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
  Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 });

  window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === "notifications"
      ? Promise.resolve({ state: Notification.permission, onchange: null })
      : originalQuery(parameters);

  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (parameter) {
    if (parameter === 37445) return "Intel Inc.";
    if (parameter === 37446) return "Intel Iris OpenGL Engine";
    return getParameter.call(this, parameter);
  };
})();
`;
}