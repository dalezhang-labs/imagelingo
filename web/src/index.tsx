import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initI18next } from "./utils/i18n";
import { getAppBridgePromise } from "./hooks/useAppBridge";

// Initialize AppBridge (no-op if not embedded) and i18n in parallel, then render
Promise.all([getAppBridgePromise(), initI18next()]).then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
