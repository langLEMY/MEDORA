import "./index.css";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { MotionConfig } from "motion/react";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { aplicarPreferenciasIniciales, usePreferencias } from "./lib/preferencias";
import { cambiarTemaAnimado, temaGuardado } from "./lib/tema";
import { enrutador } from "./rutas";
import { SesionProvider } from "./sesion/SesionProvider";
import { guardarEnEquipo, MAX_EDAD, persistidor } from "./lib/sinConexion";

aplicarPreferenciasIniciales();
// "Sistema": sigue a Windows en vivo si cambia de claro a oscuro con MEDORA abierto.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (temaGuardado() === "sistema") cambiarTemaAnimado("sistema");
});

const qc = new QueryClient({
  defaultOptions: {
    // gcTime ≥ lo que dura la copia en el equipo, para que no se descarte antes.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true, gcTime: MAX_EDAD },
    // Sin conexión, los cambios fallan al instante con un mensaje claro (no quedan en cola).
    mutations: { retry: 0, networkMode: "always" },
  },
});

/** Movimiento según Windows ("user") o apagado si el usuario lo pidió en su perfil. */
function Movimiento({ children }: { children: ReactNode }) {
  const { movimiento } = usePreferencias();
  return <MotionConfig reducedMotion={movimiento === "reducido" ? "always" : "user"}>{children}</MotionConfig>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={qc}
      persistOptions={{ persister: persistidor, maxAge: MAX_EDAD, buster: __VERSION_APP__, dehydrateOptions: { shouldDehydrateQuery: guardarEnEquipo } }}
    >
      <Movimiento>
        <SesionProvider>
          <RouterProvider router={enrutador} />
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{ className: "!rounded-xl !font-sans !text-sm" }}
          />
        </SesionProvider>
      </Movimiento>
    </PersistQueryClientProvider>
  </StrictMode>,
);
