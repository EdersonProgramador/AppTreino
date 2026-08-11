import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppQueryProvider } from "./lib/query-client";
import { wireStudentSyncBus } from "./stores/studentSyncStore";
import "./index.css";

wireStudentSyncBus();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppQueryProvider>
        <App />
      </AppQueryProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
