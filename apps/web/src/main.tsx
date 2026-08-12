import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppQueryProvider } from "./lib/query-client";
import { wireStudentSyncBus } from "./stores/studentSyncStore";
import "./index.css";

wireStudentSyncBus();

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
