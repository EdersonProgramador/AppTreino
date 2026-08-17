import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppQueryProvider } from "./lib/query-client";
import { wireStudentSyncBus } from "./stores/studentSyncStore";
import { wireEventBusBroadcast } from "./lib/event-bus";
import { wireNativeKeyboardViewport } from "./lib/native-keyboard";
import { useUiPrefsStore } from "./stores/uiPrefsStore";
import "./index.css";

wireStudentSyncBus();
wireEventBusBroadcast();
useUiPrefsStore.getState().hydrate();

if (typeof navigator !== "undefined") {
  const nativeApp =
    /AppTreinoMobile/i.test(navigator.userAgent) ||
    new URLSearchParams(window.location.search).get("app") === "mobile";
  if (nativeApp) {
    document.documentElement.classList.add("is-native-app");
    wireNativeKeyboardViewport();
  }
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppQueryProvider>
        <BrowserRouter basename={basename === "/" ? undefined : basename}>
          <App />
        </BrowserRouter>
      </AppQueryProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
