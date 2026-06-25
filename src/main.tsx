import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "github-markdown-css/github-markdown.css";
import "highlight.js/styles/github.css";
import "katex/dist/katex.min.css";
import "leaflet/dist/leaflet.css";
import "./lib/i18n";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
