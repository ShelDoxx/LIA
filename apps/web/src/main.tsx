import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { LiaProvider } from "./context/LiaContext";
import "./index.css";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <LiaProvider>
        <App />
      </LiaProvider>
    </BrowserRouter>
  </StrictMode>,
);
