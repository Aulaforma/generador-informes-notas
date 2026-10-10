"use client";

import React from "react";
import Link from "next/link";
import { NavSection } from "@/types/dashboard";
import { useAuth } from "@/context/AuthContext";

interface SidebarProps {
  currentSection: NavSection;
  onSelectSection?: (section: NavSection) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: NavSection;
  label: string;
  href: string;
  icon: (props: { className?: string }) => React.ReactNode;
  badge?: string;
  onlyUtp?: boolean;
}

const navItems: NavItem[] = [
  {
    id: "inicio",
    label: "Inicio",
    href: "/",
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: "cursos",
    label: "Cursos",
    href: "/",
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    id: "libretas",
    label: "Libretas",
    href: "/",
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "docentes",
    label: "Docentes",
    href: "/docentes",
    onlyUtp: true,
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: "asignaturas",
    label: "Asignaturas",
    href: "/asignaturas",
    onlyUtp: true,
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    id: "periodos",
    label: "Periodos",
    href: "/periodos",
    onlyUtp: true,
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: "configuracion",
    label: "Configuración",
    href: "/configuracion",
    onlyUtp: true,
    icon: ({ className }) => (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

export function Sidebar({
  currentSection,
  onSelectSection,
  isOpenMobile,
  onCloseMobile,
}: SidebarProps) {
  const { profile, logout } = useAuth();
  const isDocente = profile?.rol === "docente";

  const visibleNavItems = navItems.filter((item) => {
    if (isDocente && item.onlyUtp) {
      return false;
    }
    return true;
  });

  return (
    <>
      {/* Backdrop para dispositivos móviles */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Barra lateral */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#0b192c] text-slate-200 flex flex-col border-r border-[#162a45] shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Cabecera de la barra lateral */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-[#162a45] bg-[#081322]">
          <Link
            href="/"
            onClick={onCloseMobile}
            className="flex items-center gap-3.5 focus:outline-none"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-700/80 border border-blue-400/30 flex items-center justify-center text-white shadow-inner">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 14l9-5-9-5-9 5 9 5z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
                />
              </svg>
            </div>
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-blue-300">
                Sistema Escolar
              </span>
              <h2 className="text-base font-bold text-white tracking-tight leading-snug">
                Libreta de Notas
              </h2>
            </div>
          </Link>

          {/* Botón cerrar para móvil */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden focus:outline-none"
            aria-label="Cerrar menú"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Institución Resumen en Sidebar */}
        <div className="px-5 py-4 bg-[#0d1d33] border-b border-[#162a45]">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Establecimiento
          </p>
          <p className="text-sm font-semibold text-white truncate mt-0.5" title="Liceo Andrés Alcázar de Tucapel">
            Liceo Andrés Alcázar
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-950 text-blue-200 border border-blue-800">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
              {profile?.rol === "docente" ? "Panel Docente" : "Panel UTP"}
            </span>
            <span className="text-xs text-slate-400">Año {new Date().getFullYear()}</span>
          </div>
        </div>

        {/* Menú de Navegación */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Menú principal">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Navegación
          </p>
          {visibleNavItems.map((item) => {
            // El ítem "libretas" actúa como acceso rápido a "/" sin estado activo permanente
            const isActive = item.id !== "libretas" && currentSection === item.id;
            const Icon = item.icon;

            const isLink = item.href && item.href !== "#";

            const content = (
              <>
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? "text-blue-200" : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      isActive
                        ? "bg-blue-950 text-blue-200 border border-blue-700"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </>
            );

            const className = `w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-blue-800 text-white shadow-sm shadow-blue-950 border border-blue-600/40"
                : "text-slate-300 hover:text-white hover:bg-slate-800/60"
            }`;

            if (isLink) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    onSelectSection?.(item.id === "libretas" ? "inicio" : item.id);
                    onCloseMobile();
                  }}
                  className={className}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSection?.(item.id);
                  onCloseMobile();
                }}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </nav>

        {/* Pie de la barra lateral con perfil institucional y botón cerrar sesión */}
        <div className="p-4 border-t border-[#162a45] bg-[#081322]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-900 border border-blue-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {profile?.rol ? profile.rol.toUpperCase() : "UTP"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {profile?.nombre || "Usuario"}
              </p>
              <p className="text-[11px] text-blue-300 font-semibold truncate uppercase">
                {profile?.rol ? profile.rol.toUpperCase() : "UTP"}
              </p>
            </div>
            {/* Botón Cerrar Sesión (Requisito 11) */}
            <button
              type="button"
              onClick={() => logout()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Cerrar sesión institucional"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
