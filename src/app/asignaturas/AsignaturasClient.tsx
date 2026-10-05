"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { InstitutionalInfo, NavSection, DbAsignatura } from "@/types/dashboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { AsignaturaModal } from "./AsignaturaModal";

interface AsignaturasClientProps {
  institution: InstitutionalInfo;
}

export function AsignaturasClient({ institution }: AsignaturasClientProps) {
  const { profile, isLoading: authLoading } = useAuth();
  const isUtp = profile?.rol === "utp";

  const [currentSection, setCurrentSection] = useState<NavSection>("asignaturas");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  // Estados de datos
  const [asignaturas, setAsignaturas] = useState<DbAsignatura[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtro de búsqueda
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [asignaturaToEdit, setAsignaturaToEdit] = useState<DbAsignatura | null>(null);

  const fetchAsignaturas = useCallback(async () => {
    if (!isUtp) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from("asignaturas")
        .select("id, nombre, activo")
        .order("nombre", { ascending: true });

      if (error) {
        setErrorMsg(`Error al consultar catálogo de asignaturas: ${error.message}`);
        setAsignaturas([]);
        return;
      }

      setAsignaturas((data as DbAsignatura[]) || []);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error inesperado al conectar con Supabase."
      );
      setAsignaturas([]);
    } finally {
      setIsLoading(false);
    }
  }, [isUtp]);

  useEffect(() => {
    if (!authLoading && isUtp) {
      fetchAsignaturas();
    } else if (!authLoading && !isUtp) {
      setIsLoading(false);
    }
  }, [authLoading, isUtp, fetchAsignaturas]);

  // Handlers del modal
  const handleOpenCreate = () => {
    setAsignaturaToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (asig: DbAsignatura) => {
    setAsignaturaToEdit(asig);
    setIsModalOpen(true);
  };

  const handleSuccess = (msg: string) => {
    setActiveNotice(msg);
    fetchAsignaturas();
  };

  const handleError = (msg: string) => {
    setActiveNotice(`Error: ${msg}`);
  };

  // Filtrado reactivo en cliente por nombre
  const filteredAsignaturas = useMemo(() => {
    if (!searchQuery.trim()) return asignaturas;
    const q = searchQuery.toLowerCase().trim();
    return asignaturas.filter((a) => a.nombre.toLowerCase().includes(q));
  }, [asignaturas, searchQuery]);

  // Contadores
  const totalCount = asignaturas.length;
  const activeCount = asignaturas.filter((a) => a.activo !== false).length;
  const inactiveCount = totalCount - activeCount;

  // 1. Estado de carga de sesión
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-semibold text-slate-700">Verificando credenciales institucionales...</p>
        </div>
      </div>
    );
  }

  // 2. Control de Acceso: Bloqueo estricto para no-UTP
  if (!isUtp) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 mx-auto flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Acceso Restringido</h2>
            <p className="text-xs text-slate-500 mt-2">
              Este módulo de administración del catálogo de asignaturas es de uso exclusivo para la Unidad Técnica Pedagógica (UTP).
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 transition-colors shadow-xs"
            >
              Volver al Panel Principal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Barra lateral izquierda */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={(section) => setCurrentSection(section)}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Contenedor principal con margen izquierdo para desktop */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        {/* Cabecera institucional */}
        <Header
          institution={institution}
          onOpenMobileSidebar={() => setIsMobileMenuOpen(true)}
        />

        {/* Notificación flotante informativa */}
        {activeNotice && (
          <div className="fixed top-20 right-4 z-50 max-w-md bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-xs">
              <p className="font-bold text-white">Notificación institucional</p>
              <p className="text-slate-300 mt-0.5">{activeNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveNotice(null)}
              className="ml-auto text-slate-400 hover:text-white p-1 rounded-md"
              aria-label="Cerrar notificación"
            >
              ✕
            </button>
          </div>
        )}

        {/* Contenido principal */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Migas de pan y cabecera de la sección */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Link href="/" className="hover:text-blue-900 transition-colors">
                  Inicio
                </Link>
                <span>/</span>
                <span className="text-slate-700 font-medium">Catálogo Curricular</span>
                <span>/</span>
                <span className="text-blue-950 font-bold">Asignaturas</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Catálogo de Asignaturas
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Administración del catálogo maestro de asignaturas oficiales del establecimiento para asignaciones curriculares.
              </p>
            </div>

            {/* Botón "+ Nueva asignatura" */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Nueva asignatura</span>
              </button>
            </div>
          </div>

          {/* Tarjetas de Resumen Superior */}
          <section aria-labelledby="resumen-asignaturas">
            <h2 id="resumen-asignaturas" className="sr-only">
              Resumen de asignaturas
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Total Asignaturas */}
              <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Total Asignaturas
                  </span>
                  <div className="text-2xl font-extrabold text-slate-900 mt-1">
                    {isLoading ? "..." : totalCount}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Registradas en el catálogo
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                </div>
              </div>

              {/* Activas */}
              <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Asignaturas Activas
                  </span>
                  <div className="text-2xl font-extrabold text-emerald-950 mt-1">
                    {isLoading ? "..." : activeCount}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Habilitadas para asignación
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>

              {/* Inactivas */}
              <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Asignaturas Inactivas
                  </span>
                  <div className="text-2xl font-extrabold text-slate-800 mt-1">
                    {isLoading ? "..." : inactiveCount}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Fuera de nuevas asignaciones
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </section>

          {/* Barra de Búsqueda */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre de asignatura..."
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 self-end sm:self-center">
              Mostrando <span className="font-bold text-slate-800">{filteredAsignaturas.length}</span> de{" "}
              <span className="font-bold text-slate-800">{totalCount}</span> asignaturas
            </div>
          </div>

          {/* Mensaje de error al consultar */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={fetchAsignaturas}
                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 font-semibold rounded-lg transition-colors"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Tabla Institucional de Asignaturas */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="py-3.5 px-6">Asignatura</th>
                    <th className="py-3.5 px-6">Estado</th>
                    <th className="py-3.5 px-6 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-slate-400">
                        <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p>Cargando catálogo institucional de asignaturas...</p>
                      </td>
                    </tr>
                  ) : filteredAsignaturas.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-slate-400">
                        <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-slate-400 mb-2">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                        <p className="font-semibold text-slate-700">No se encontraron asignaturas</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {searchQuery
                            ? "Ninguna materia coincide con el filtro de búsqueda aplicado."
                            : "No hay asignaturas registradas actualmente en el sistema."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredAsignaturas.map((asig) => {
                      const isActive = asig.activo !== false;

                      return (
                        <tr
                          key={asig.id}
                          className="hover:bg-slate-50/60 transition-colors group"
                        >
                          {/* Asignatura */}
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 text-blue-900 font-bold flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.8}
                                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                                  />
                                </svg>
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-sm block">
                                  {asig.nombre}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Código #{asig.id}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Estado */}
                          <td className="py-3.5 px-6">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Activa
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                Inactiva
                              </span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="py-3.5 px-6 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(asig)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                />
                              </svg>
                              <span>Editar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pie de tabla con información */}
            <div className="bg-slate-50/70 border-t border-slate-200/80 px-6 py-3 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
              <span>
                Catálogo institucional administrado por Unidad Técnica Pedagógica.
              </span>
              <span>
                Total activo: <strong className="text-slate-800">{activeCount}</strong> materias
              </span>
            </div>
          </div>
        </main>
      </div>

      {/* Modal para Crear y Editar Asignatura */}
      <AsignaturaModal
        isOpen={isModalOpen}
        asignaturaToEdit={asignaturaToEdit}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
        onError={handleError}
      />
    </div>
  );
}
