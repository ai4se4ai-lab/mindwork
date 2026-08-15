import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@web/app/App";
import { installWebAdapter, resolveRelayUrl } from "@web/platform/bootstrap";

// Must happen before render — reused desktop modules invoke during module init.
const adapter = installWebAdapter(resolveRelayUrl());

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App capabilities={adapter.capabilities} />
  </React.StrictMode>,
);
