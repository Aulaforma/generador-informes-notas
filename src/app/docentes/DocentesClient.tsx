"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { InstitutionalInfo, NavSection, DbDocente } from "@/types/dashboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { DocenteModal } from "./DocenteModal";

interface DocentesClientProps {
  institution: InstitutionalInfo;
}

export function DocentesClient({ institution }: DocentesClientProps) {
  const { profile, isLoading: authLoading } = useAuth();
  const isUtp = profile?.rol === "utp";

  const [currentSection, setCurrentSection] = useState<NavSection>("docentes");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  // Estados para datos de docentes
  const [docentes, setDocentes] = useState<DbDocente[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtro de búsqueda
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [docenteToEdit, setDocenteToEdit] = useState<DbDocente | null>(null);

  const fetchDocentes = useCallback(async () => {
    if (!isUtp) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from("docentes")
        .select("id, nombres, apellidos, email, activo")
        .order("apellidos", { ascending: true });

      if (error) {
        setErrorMsg(`Error al consultar docentes: ${error.message}`);
        setDocentes([]);
        return;
      }

      setDocentes((data as DbDocente[]) || []);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error inesperado al conectar con Supabase."
      );
      setDocentes([]);
    } finally {
      setIsLoading(false);
    }
  }, [isUtp]);

  useEffect(() => {
    if (!authLoading && isUtp) {
      fetchDocentes();
    } else if (!authLoading && !isUtp) {
      setIsLoading(false);
    }
  }, [authLoading, isUtp, fetchDocentes]);

  // Handlers para el modal
  const handleOpenCreate = () => {
    setDocenteToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (docente: DbDocente) => {
    setDocenteToEdit(docente);
    setIsModalOpen(true);
  };

  const handleSuccess = (msg: string) => {
    setActiveNotice(msg);
    fetchDocentes();
  };

  const handleError = (msg: string) => {
    setActiveNotice(`Error: ${msg}`);
  };

  // Filtrado reactivo en cliente
  const filteredDocentes = useMemo(() => {
    if (!searchQuery.trim()) return docentes;
    const q = searchQuery.toLowerCase().trim();
    return docentes.filter((d) => {
      const fullName = `${d.nombres} ${d.apellidos}`.toLowerCase();
      const reverseName = `${d.apellidos} ${d.nombres}`.toLowerCase();
      const emailMatch = d.email ? d.email.toLowerCase().includes(q) : false;
      return fullName.includes(q) || reverseName.includes(q) || emailMatch;
    });
  }, [docentes, searchQuery]);

  // Contadores
  const totalCount = docentes.length;
  const activeCount = docentes.filter((d) => d.activo !== false).length;
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

  // 2. Control de Acceso: Bloqueo para no-UTP
  if (!isUtp) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 mx-auto flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Acceso Restringido</h2>
            <p className="text-xs text-slate-500 mt-2">
              Este módulo de administración del padrón docente es de uso exclusivo para la Unidad Técnica Pedagógica (UTP).
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver al Panel Principal</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Vista Autorizada para UTP
  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Barra lateral */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={(section) => setCurrentSection(section)}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Contenedor principal */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        <Header
          institution={institution}
          onOpenMobileSidebar={() => setIsMobileMenuOpen(true)}
        />

        {/* Notificación flotante informativa */}
        {activeNotice && (
          <div className="fixed top-20 right-4 z-50 max-w-md bg-blue-950 text-white px-4 py-3 rounded-xl shadow-lg border border-blue-800 flex items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-blue-800 flex items-center justify-center shrink-0 text-blue-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-xs">
              <p className="font-semibold text-blue-200">Aviso del Sistema</p>
              <p className="text-slate-200">{activeNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveNotice(null)}
              className="ml-auto text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Migas de pan */}
          <nav aria-label="Breadcrumb" className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link href="/" className="hover:text-blue-900 font-medium transition-colors">
                Panel UTP
              </Link>
              <span>/</span>
              <span className="text-slate-900 font-semibold">Padrón de Docentes</span>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver al Panel</span>
            </Link>
          </nav>

          {/* Tarjeta de Resumen y Métricas Superiores */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    Administración de Docentes
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                    Dotación 2026
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Gestión institucional de profesores para asignación curricular y jefaturas de curso.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer self-start md:self-auto"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Nuevo docente</span>
              </button>
            </div>

            {/* Contadores y Buscador */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Total Registrados
                  </span>
                  <span className="text-xl font-extrabold text-slate-900 mt-0.5 block">
                    {totalCount} profesores
                  </span>
                </div>
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-900">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>

              <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
                    Docentes Activos
                  </span>
                  <span className="text-xl font-extrabold text-emerald-900 mt-0.5 block">
                    {activeCount} habilitados
                  </span>
                </div>
                <div className="w-9 h-9 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Docentes Inactivos
                  </span>
                  <span className="text-xl font-extrabold text-slate-700 mt-0.5 block">
                    {inactiveCount} desvinculados
                  </span>
                </div>
                <div className="w-9 h-9 rounded-lg bg-slate-200/70 border border-slate-300 flex items-center justify-center text-slate-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Input de Búsqueda */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por apellidos, nombres o correo electrónico..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white transition-colors"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 bg-slate-200/60 rounded-full w-5 h-5 flex items-center justify-center"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Estado de Carga */}
          {isLoading && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center space-y-4">
              <div className="w-10 h-10 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-sm font-semibold text-slate-700">Consultando padrón de docentes en Supabase...</p>
            </div>
          )}

          {/* Estado de Error */}
          {!isLoading && errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center text-rose-900">
              <div className="w-10 h-10 rounded-full bg-rose-100 border border-rose-300 mx-auto flex items-center justify-center font-bold text-rose-700 mb-2">
                !
              </div>
              <h4 className="font-bold text-sm">No se pudo cargar el listado de docentes</h4>
              <p className="text-xs text-rose-700 mt-1 max-w-md mx-auto">{errorMsg}</p>
              <button
                type="button"
                onClick={fetchDocentes}
                className="mt-4 px-4 py-1.5 text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white rounded-lg transition-colors"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Tabla de Docentes */}
          {!isLoading && !errorMsg && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              {filteredDocentes.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 mx-auto flex items-center justify-center text-slate-400">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h4 className="font-bold text-sm text-slate-800">No se encontraron docentes</h4>
                  <p className="text-xs text-slate-500">
                    {searchQuery
                      ? "No hay coincidencias con el término de búsqueda."
                      : "No hay docentes registrados en la base de datos."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#0f2942] text-white text-xs font-semibold tracking-wider uppercase">
                      <tr>
                        <th scope="col" className="px-6 py-3.5">
                          Docente
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Correo Institucional
                        </th>
                        <th scope="col" className="px-6 py-3.5 text-center">
                          Estado
                        </th>
                        <th scope="col" className="px-6 py-3.5 text-right">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDocentes.map((docente) => {
                        const isDocActive = docente.activo !== false;
                        const initialLetter = docente.apellidos ? docente.apellidos.charAt(0) : "P";

                        return (
                          <tr key={docente.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Columna Docente */}
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-900 shrink-0">
                                  {initialLetter}
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-900 block">
                                    Prof. {docente.apellidos}, {docente.nombres}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    ID Supabase: #{docente.id}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Columna Email */}
                            <td className="px-6 py-3.5 text-slate-600 text-xs font-mono">
                              {docente.email ? (
                                <span className="text-slate-700">{docente.email}</span>
                              ) : (
                                <span className="text-slate-400 italic font-sans">Sin correo registrado</span>
                              )}
                            </td>

                            {/* Columna Estado */}
                            <td className="px-6 py-3.5 text-center">
                              {isDocActive ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Activo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  Inactivo
                                </span>
                              )}
                            </td>

                            {/* Columna Acciones */}
                            <td className="px-6 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(docente)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-semibold shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
                                title="Editar datos del docente"
                              >
                                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span>Editar</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Modal para Crear y Editar Docente */}
        <DocenteModal
          isOpen={isModalOpen}
          docenteToEdit={docenteToEdit}
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleSuccess}
          onError={handleError}
        />

        {/* Footer */}
        <footer className="mt-auto border-t border-slate-200/80 bg-white py-4 px-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>© 2026 {institution.schoolName} — Todos los derechos reservados.</span>
            <span className="text-slate-400">Padrón de Docentes · Rol UTP</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
