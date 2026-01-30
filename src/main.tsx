import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AppModeProvider } from "./contexts/AppModeContext";
import { VirtualClockProvider } from "./contexts/VirtualClockContext";
import { initStorageBackend } from "./app/storageBackend";

async function bootstrap() {
  await initStorageBackend();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppModeProvider>
        <VirtualClockProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </VirtualClockProvider>
      </AppModeProvider>
    </React.StrictMode>
  );
}

bootstrap();
