import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppModeProvider } from "./contexts/AppModeContext";
import { VirtualClockProvider } from "./contexts/VirtualClockContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppModeProvider>
      <VirtualClockProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </VirtualClockProvider>
    </AppModeProvider>
  </React.StrictMode>
);

