// React renderer entry point
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

function mount() {
  let rootEl = document.getElementById("root");
  if (!rootEl) {
    rootEl = document.createElement("div");
    rootEl.id = "root";
    document.body.appendChild(rootEl);
  }
  const root = createRoot(rootEl);
  root.render(<App />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
