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
import { isChunkLoadError, reloadForStaleChunk } from "./lib/lazy-retry";
import "./index.css";

wireStudentSyncBus();
wireEventBusBroadcast();
useUiPrefsStore.getState().hydrate();

/** Exposed for same-origin activity-map iframe (query string may be stripped by cache). */
if (typeof window !== "undefined") {
  const mapsWindow = window as Window & {
    __GOOGLE_MAPS_KEY__?: string;
    __GOOGLE_MAPS_MAP_ID__?: string;
    __MAPBOX_ACCESS_TOKEN__?: string;
  };
  mapsWindow.__GOOGLE_MAPS_KEY__ = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || "";
  mapsWindow.__GOOGLE_MAPS_MAP_ID__ = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || "";
  mapsWindow.__MAPBOX_ACCESS_TOKEN__ = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) || "";
}

if (typeof navigator !== "undefined") {
  const nativeApp =
    /AppTreinoMobile/i.test(navigator.userAgent) ||
    new URLSearchParams(window.location.search).get("app") === "mobile";
  if (nativeApp) {
    document.documentElement.classList.add("is-native-app");
    wireNativeKeyboardViewport();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      reloadForStaleChunk();
    }
  });
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
