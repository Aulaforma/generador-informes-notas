"use client";

import React from "react";
import { InstitutionalInfo } from "@/types/dashboard";
import { useAuth } from "@/context/AuthContext";

interface HeaderProps {
  institution: InstitutionalInfo;
  onOpenMobileSidebar: () => void;
}

export function Header({ institution, onOpenMobileSidebar }: HeaderProps) {
  const { profile, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 shadow-xs">
      {/* Barra superior de identificación institucional */}
      <div className="bg-[#0f2942] text-white px-4 sm:px-6 py-2 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold tracking-wide">
              {institution.schoolName}
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-300">
            <span>Año Escolar: <strong className="text-white">{institution.schoolYear}</strong></span>
            <span className="hidden sm:inline text-slate-500">•</span>
            <span>Periodo: <strong className="text-white">{institution.period}</strong></span>
          </div>
        </div>
      </div>

      {/* Navegación y encabezado principal */}
      <div className="px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Botón menú móvil */}
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 lg:hidden focus:outline-none focus:ring-2 focus:ring-blue-900"
              aria-label="Abrir menú de navegación"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {institution.systemName}
                </h1>
                <span className="hidden md:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                  {profile?.rol ? profile.rol.toUpperCase() : institution.role}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Plataforma de gestión curricular y evaluación escolar
              </p>
            </div>
          </div>

          {/* Estado de sincronización / Datos UTP y Cerrar Sesión */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-bold text-slate-900">
                {profile?.nombre || "Usuario"}
              </span>
              <span className="text-[11px] font-semibold text-blue-900 uppercase">
                {profile?.rol ? profile.rol.toUpperCase() : "UTP"}
              </span>
            </div>

            <div className="w-10 h-10 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-blue-100">
              {profile?.rol ? profile.rol.toUpperCase() : "UTP"}
            </div>

            {/* Botón Cerrar Sesión (Requisito 11) */}
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              title="Cerrar sesión institucional"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
