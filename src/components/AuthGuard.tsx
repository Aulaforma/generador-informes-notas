"use client";

import React, { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { LoginView } from "./LoginView";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, profile, isLoading } = useAuth();

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

  // Si está autenticado y posee perfil UTP activo, permitir acceso a los módulos
  return <>{children}</>;
}
