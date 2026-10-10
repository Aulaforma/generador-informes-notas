"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { InstitutionalInfo, NavSection, DbConfiguracionInstitucional } from "@/types/dashboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface ConfiguracionClientProps {
  institution: InstitutionalInfo;
}

export function ConfiguracionClient({ institution }: ConfiguracionClientProps) {
  const { profile, isLoading: authLoading } = useAuth();
  const isUtp = profile?.rol === "utp";

  const [currentSection, setCurrentSection] = useState<NavSection>("configuracion");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  // Estados del formulario
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [nombreEstablecimiento, setNombreEstablecimiento] = useState<string>(
    "Liceo Andrés Alcázar de Tucapel"
  );
  const [ciudad, setCiudad] = useState<string>("Tucapel");
  const [jefeUtpNombre, setJefeUtpNombre] = useState<string>("");
  const [directorNombre, setDirectorNombre] = useState<string>("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  // Estados de carga y validación
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cargar configuración existente para el año escolar
  const fetchConfiguracion = useCallback(async (targetAnio: number) => {
    setIsLoadingData(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from("configuracion_institucional")
        .select("id, anio, nombre_establecimiento, ciudad, jefe_utp_nombre, director_nombre, updated_at")
        .eq("anio", targetAnio)
        .maybeSingle();

      if (error) {
        throw new Error(`Error al consultar configuración institucional: ${error.message}`);
      }

      if (data) {
        const config = data as DbConfiguracionInstitucional;
        setNombreEstablecimiento(config.nombre_establecimiento || "Liceo Andrés Alcázar de Tucapel");
        setCiudad(config.ciudad || "Tucapel");
        setJefeUtpNombre(config.jefe_utp_nombre || "");
        setDirectorNombre(config.director_nombre || "");
        setLastUpdatedAt(config.updated_at || null);
      } else {
        // Valores predeterminados si aún no existe registro para este año
        setNombreEstablecimiento("Liceo Andrés Alcázar de Tucapel");
        setCiudad("Tucapel");
        setJefeUtpNombre("");
        setDirectorNombre("");
        setLastUpdatedAt(null);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Error inesperado al cargar la configuración institucional."
      );
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isUtp) {
      fetchConfiguracion(anio);
    } else if (!authLoading && !isUtp) {
      setIsLoadingData(false);
    }
  }, [authLoading, isUtp, anio, fetchConfiguracion]);

  // Manejador del guardado
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setActiveNotice(null);

    const cleanAnio = Number(anio);
    const cleanEstablecimiento = nombreEstablecimiento.trim();
    const cleanCiudad = ciudad.trim();
    const cleanJefeUtp = jefeUtpNombre.trim();
    const cleanDirector = directorNombre.trim();

    if (!cleanAnio || isNaN(cleanAnio) || cleanAnio < 2000 || cleanAnio > 2100) {
      setErrorMessage("Por favor ingrese un año escolar válido (ej. 2026).");
      return;
    }

    if (!cleanEstablecimiento) {
      setErrorMessage("El nombre del establecimiento educacional es obligatorio.");
      return;
    }

    if (!cleanCiudad) {
      setErrorMessage("La ciudad o comuna del establecimiento es obligatoria.");
      return;
    }

    setIsSaving(true);

    try {
      const now = new Date().toISOString();
      const payload = {
        anio: cleanAnio,
        nombre_establecimiento: cleanEstablecimiento,
        ciudad: cleanCiudad,
        jefe_utp_nombre: cleanJefeUtp !== "" ? cleanJefeUtp : null,
        director_nombre: cleanDirector !== "" ? cleanDirector : null,
        updated_at: now,
      };

      const { error } = await supabase
        .from("configuracion_institucional")
        .upsert(payload, { onConflict: "anio" });

      if (error) {
        throw new Error(`Error al guardar en Supabase: ${error.message}`);
      }

      setLastUpdatedAt(now);
      setActiveNotice("Configuración institucional guardada correctamente.");
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Error inesperado al guardar la configuración institucional."
      );
    } finally {
      setIsSaving(false);
    }
  };

  // 1. Estado de carga de sesión
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">
            Verificando credenciales institucionales...
          </p>
        </div>
      </div>
    );
  }

  // 2. Control de Acceso: Bloqueo estricto para no-UTP (docentes)
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
              Este módulo de configuración institucional es de uso exclusivo para la Unidad Técnica Pedagógica (UTP).
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl w-full mx-auto space-y-6">
          {/* Migas de pan */}
          <nav aria-label="Breadcrumb" className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link href="/" className="hover:text-blue-900 font-medium transition-colors">
                Panel UTP
              </Link>
              <span>/</span>
              <span className="text-slate-900 font-semibold">Configuración Institucional</span>
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

          {/* Tarjeta de Formulario Principal */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
            <div className="border-b border-slate-100 pb-5 mb-6">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Configuración Institucional
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                  Año Escolar {anio}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Configure el nombre oficial del establecimiento y las autoridades institucionales que figurarán en el pie de firmas de las libretas de notas.
              </p>
            </div>

            {errorMessage && (
              <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-xs flex items-center gap-2.5 shadow-2xs">
                <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              {/* Año Escolar */}
              <div>
                <label htmlFor="input-anio" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Año Escolar <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="input-anio"
                    type="number"
                    min="2000"
                    max="2100"
                    value={anio}
                    onChange={(e) => setAnio(Number(e.target.value))}
                    className="w-36 px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 bg-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => fetchConfiguracion(anio)}
                    disabled={isLoadingData}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                    title="Cargar datos para el año ingresado"
                  >
                    {isLoadingData ? "Cargando..." : "Cargar año"}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Cada año escolar puede tener autoridades asignadas independientes.
                </p>
              </div>

              {/* Establecimiento y Ciudad */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <div className="sm:col-span-2">
                  <label htmlFor="input-establecimiento" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nombre del Establecimiento <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-establecimiento"
                    type="text"
                    value={nombreEstablecimiento}
                    onChange={(e) => setNombreEstablecimiento(e.target.value)}
                    placeholder="Ej. Liceo Andrés Alcázar de Tucapel"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 bg-white"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="input-ciudad" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Ciudad / Comuna <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-ciudad"
                    type="text"
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                    placeholder="Ej. Tucapel"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 bg-white"
                    required
                  />
                </div>
              </div>

              {/* Autoridades Institucionales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label htmlFor="input-jefe-utp" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Jefe(a) UTP
                  </label>
                  <input
                    id="input-jefe-utp"
                    type="text"
                    value={jefeUtpNombre}
                    onChange={(e) => setJefeUtpNombre(e.target.value)}
                    placeholder="Ej. Carlos Muñoz Mendoza"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nombre impreso en la columna de firma &quot;Jefe UTP&quot;.
                  </p>
                </div>

                <div>
                  <label htmlFor="input-director" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Director(a)
                  </label>
                  <input
                    id="input-director"
                    type="text"
                    value={directorNombre}
                    onChange={(e) => setDirectorNombre(e.target.value)}
                    placeholder="Ej. Guillermo Soto Lagos"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nombre impreso en la columna de firma &quot;Director(a)&quot;.
                  </p>
                </div>
              </div>

              {/* Botón de Guardar y Última Actualización */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-500">
                  {lastUpdatedAt ? (
                    <span>
                      Última actualización:{" "}
                      <strong className="text-slate-700">
                        {new Date(lastUpdatedAt).toLocaleString("es-CL")}
                      </strong>
                    </span>
                  ) : (
                    <span>Sin registros previos guardados para este año escolar.</span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSaving || isLoadingData}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-900"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Guardar configuración</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
