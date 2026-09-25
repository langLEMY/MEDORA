import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { aplicarTema, cambiarTemaAnimado, temaGuardado } from "./lib/tema";
import { enrutador } from "./rutas";
import { SesionProvider } from "./sesion/SesionProvider";

aplicarTema(temaGuardado());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (temaGuardado() === "sistema") cambiarTemaAnimado("sistema");
});

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MotionConfig reducedMotion="user">
        <SesionProvider>
          <RouterProvider router={enrutador} />
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{ className: "!rounded-xl !font-sans !text-sm" }}
          />
        </SesionProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
