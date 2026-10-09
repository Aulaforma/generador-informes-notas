import type { Metadata } from "next";
import { CambiarPasswordClient } from "./CambiarPasswordClient";

export const metadata: Metadata = {
  title: "Cambiar Contraseña | Liceo Andrés Alcázar de Tucapel",
  description:
    "Establecer nueva contraseña obligatoria para cuentas institucionales.",
};

export default function CambiarPasswordPage() {
  return <CambiarPasswordClient />;
}
