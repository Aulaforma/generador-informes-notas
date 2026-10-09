"use client";

import React, { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LoginView } from "./LoginView";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, profile, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isChangingPasswordRoute = pathname === "/cambiar-password";
  const mustChangePassword = Boolean(profile?.debe_cambiar_password);

  useEffect(() => {
    if (isLoading || !user || !profile) return;

    if (mustChangePassword && !isChangingPasswordRoute) {
      router.replace("/cambiar-password");
    } else if (!mustChangePassword && isChangingPasswordRoute) {
      router.replace("/");
    }
  }, [isLoading, user, profile, mustChangePassword, isChangingPasswordRoute, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#071527] text-white flex flex-col items-center justify-center p-4 select-none">
        <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-center space-y-1">
          <h2 className="text-base font-bold text-white tracking-tight">
            Libreta de Notas
          </h2>
          <p className="text-xs text-slate-400">
            Liceo Andrés Alcázar de Tucapel
          </p>
          <span className="inline-block mt-2 px-3 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800">
            Comprobando sesión institucional...
          </span>
        </div>
      </div>
    );
  }

  // Si no hay usuario autenticado o no posee perfil válido, mostrar Login
  if (!user || !profile) {
    return <LoginView />;
  }

  // Si el usuario debe cambiar obligatoriamente su contraseña:
  if (mustChangePassword) {
    // Si ya se encuentra en /cambiar-password, renderizar la pantalla
    if (isChangingPasswordRoute) {
      return <>{children}</>;
    }

    // Si intenta acceder a cualquier otra área protegida, bloquear acceso y redirigir
    return (
      <div className="min-h-screen bg-[#071527] text-white flex flex-col items-center justify-center p-4 select-none">
        <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-center space-y-1">
          <h2 className="text-base font-bold text-white tracking-tight">
            Cambio obligatorio de contraseña
          </h2>
          <p className="text-xs text-slate-400">
            Redirigiendo a la pantalla de seguridad...
          </p>
        </div>
      </div>
    );
  }

  // Si el usuario ya completó el cambio de contraseña (debe_cambiar_password = false)
  // pero navega manualmente a /cambiar-password, bloquear y redirigir al panel principal
  if (isChangingPasswordRoute) {
    return (
      <div className="min-h-screen bg-[#071527] text-white flex flex-col items-center justify-center p-4 select-none">
        <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-center space-y-1">
          <h2 className="text-base font-bold text-white tracking-tight">
            Libreta de Notas
          </h2>
          <p className="text-xs text-slate-400">
            Redirigiendo al panel principal...
          </p>
        </div>
      </div>
    );
  }

  // Si está autenticado y no requiere cambio de contraseña, permitir acceso a los módulos
  return <>{children}</>;
}
