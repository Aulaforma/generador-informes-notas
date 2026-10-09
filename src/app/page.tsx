"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { StatCard } from "@/components/StatCard";
import { CourseCard } from "@/components/CourseCard";
import { institutionalData, metricsData } from "@/data/mockData";
import { NavSection } from "@/types/dashboard";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { CursoModal } from "./CursoModal";

interface CursoRow {
  id: number;
  nombre: string;
  nivel: string | null;
  letra: string | null;
  anio: number | null;
  activo: boolean;
  profesor_jefe_id: number | null;
  docentes: {
    id: number;
    nombres: string;
    apellidos: string;
  } | null;
}

export default function HomePage() {
  const [currentSection, setCurrentSection] = useState<NavSection>("inicio");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { profile } = useAuth();

  const [cursos, setCursos] = useState<CursoRow[]>([]);
  const [isLoadingCursos, setIsLoadingCursos] = useState<boolean>(true);
  const [cursosError, setCursosError] = useState<string | null>(null);

  const [teacherCourseIds, setTeacherCourseIds] = useState<number[] | null>(null);

  // Estados para CursoModal y notificaciones
  const [isCursoModalOpen, setIsCursoModalOpen] = useState<boolean>(false);
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  const isDocente = profile?.rol === "docente";
  const isUtp = profile?.rol === "utp";

  // 1. Cargar cursos activos directamente desde Supabase
  const fetchCursos = useCallback(async () => {
    setIsLoadingCursos(true);
    setCursosError(null);

    try {
      const { data, error } = await supabase
        .from("cursos")
        .select(`
          id,
          nombre,
          nivel,
          letra,
          anio,
          activo,
          profesor_jefe_id,
          docentes (
            id,
            nombres,
            apellidos
          )
        `)
        .eq("activo", true)
        .order("nombre", { ascending: true });

      if (error) {
        setCursosError(`Error al consultar cursos: ${error.message}`);
        setCursos([]);
        return;
      }

      setCursos((data as unknown as CursoRow[]) || []);
    } catch (err: unknown) {
      setCursosError(
        err instanceof Error ? err.message : "Error inesperado al conectar con Supabase."
      );
      setCursos([]);
    } finally {
      setIsLoadingCursos(false);
    }
  }, []);

  useEffect(() => {
    fetchCursos();
  }, [fetchCursos]);

  // 2. Si es docente, obtener los cursos asignados (asignaturas impartidas + profesor jefe)
  useEffect(() => {
    const fetchTeacherCourses = async () => {
      if (profile?.rol === "docente" && profile.docente_id) {
        try {
          const courseIds = new Set<number>();

          // A) Cursos donde imparte al menos una asignatura
          const { data: caData, error: caError } = await supabase
            .from("curso_asignaturas")
            .select("curso_id")
            .eq("docente_id", profile.docente_id);

          if (caError) {
            console.error("Error al consultar curso_asignaturas para docente:", caError);
          } else if (caData) {
            caData.forEach((row) => {
              if (row.curso_id) {
                courseIds.add(row.curso_id);
              }
            });
          }

          // B) Cursos donde está asignado como profesor jefe
          const { data: pjData, error: pjError } = await supabase
            .from("cursos")
            .select("id")
            .eq("profesor_jefe_id", profile.docente_id)
            .eq("activo", true);

          if (pjError) {
            console.error("Error al consultar cursos de jefatura para docente:", pjError);
          } else if (pjData) {
            pjData.forEach((row) => {
              if (row.id) {
                courseIds.add(row.id);
              }
            });
          }

          setTeacherCourseIds(Array.from(courseIds));
        } catch (err) {
          console.error("Error inesperado al obtener cursos del docente:", err);
          setTeacherCourseIds([]);
        }
      } else {
        setTeacherCourseIds(null);
      }
    };

    fetchTeacherCourses();
  }, [profile]);

  // 3. Filtrado de cursos visibles: UTP ve todos los activos; docente solo sus asignados por ID real
  const visibleCourses = useMemo(() => {
    if (!isDocente || teacherCourseIds === null) {
      return cursos;
    }
    return cursos.filter((c) => teacherCourseIds.includes(c.id));
  }, [cursos, isDocente, teacherCourseIds]);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Barra lateral izquierda */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={(section) => setCurrentSection(section)}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Contenedor principal con margen izquierdo para el sidebar en desktop */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        {/* Cabecera superior institucional */}
        <Header
          institution={institutionalData}
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

        {/* Contenido del Panel */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
          {/* Banner de Bienvenida y Contexto */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                  <span className="w-2 h-2 rounded-full bg-blue-700"></span>
                  {isDocente ? "Gestión de Asignaturas Docente" : "Gestión Académica e Institucional"}
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {isDocente ? "Panel Docente" : "Panel de Control UTP"}
                </h2>
                <p className="text-sm text-slate-600 max-w-2xl">
                  {isDocente
                    ? `Cursos y asignaturas asignadas a tu cargo en el ${institutionalData.schoolName}.`
                    : `Supervisión curricular y registro de calificaciones para el ${institutionalData.schoolName}.`}
                </p>
              </div>

              {/* Ficha rápida de Periodo */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 flex items-center gap-4 shrink-0">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800 shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Estado de Calificaciones
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-bold text-slate-900">Periodo Habilitado</span>
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {institutionalData.period} · {institutionalData.schoolYear}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Tarjetas con métricas principales: Cursos, Estudiantes, Docentes, Periodo */}
          <section aria-labelledby="metricas-panel">
            <h3 id="metricas-panel" className="sr-only">
              Resumen estadístico
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {metricsData.map((card) => {
                if (card.id === "cursos") {
                  return (
                    <StatCard
                      key={card.id}
                      card={{
                        ...card,
                        value: isLoadingCursos ? "..." : visibleCourses.length,
                        subtitle: isDocente
                          ? "Cursos asignados"
                          : "Cursos activos en el establecimiento",
                      }}
                    />
                  );
                }
                if (!isDocente && card.id === "docentes") {
                  return (
                    <Link
                      key={card.id}
                      href="/docentes"
                      className="block group transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-600 rounded-xl"
                      title="Administrar padrón de docentes"
                    >
                      <StatCard card={card} />
                    </Link>
                  );
                }
                return <StatCard key={card.id} card={card} />;
              })}
            </div>
          </section>

          {/* Sección Cursos */}
          <section aria-labelledby="seccion-cursos" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 id="seccion-cursos" className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                    Cursos
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                    {isLoadingCursos ? "..." : `${visibleCourses.length} disponible${visibleCourses.length !== 1 ? "s" : ""}`}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  {isDocente
                    ? "Cursos en los que posees asignaturas asignadas para el registro de calificaciones."
                    : "Listado de cursos registrados y habilitados para el ingreso de notas."}
                </p>
              </div>

              {/* Controles de gestión de cursos */}
              <div className="flex items-center gap-2.5">
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium text-slate-700 shadow-2xs">
                  <span className="rounded-md bg-blue-900 px-3 py-1 text-white font-semibold">
                    Activos ({visibleCourses.length})
                  </span>
                </div>

                {/* Botón "+ Nuevo curso" exclusivo para UTP */}
                {isUtp && (
                  <button
                    type="button"
                    onClick={() => setIsCursoModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 shadow-xs hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Nuevo curso</span>
                  </button>
                )}
              </div>
            </div>

            {/* Listado de cursos dinámicos */}
            {isLoadingCursos ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
                <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm font-semibold text-slate-700">Cargando cursos desde Supabase...</p>
              </div>
            ) : cursosError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-800 space-y-2">
                <p className="font-semibold text-sm">{cursosError}</p>
                <button
                  type="button"
                  onClick={fetchCursos}
                  className="px-4 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 text-xs font-bold rounded-lg transition-colors"
                >
                  Reintentar
                </button>
              </div>
            ) : visibleCourses.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                {isDocente
                  ? "No tienes cursos asignados actualmente."
                  : "No hay cursos registrados o activos en el sistema."}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleCourses.map((curso) => {
                  const doc = curso.docentes;
                  const headTeacherName =
                    doc?.nombres && doc?.apellidos
                      ? `Prof. ${doc.nombres} ${doc.apellidos}`.trim()
                      : "Sin asignar";

                  return (
                    <CourseCard
                      key={curso.id}
                      course={{
                        id: curso.id,
                        nombre: curso.nombre,
                        nivel: curso.nivel || "Educación Regular",
                        letra: curso.letra || "",
                        anio: curso.anio || 2026,
                        headTeacher: headTeacherName,
                      }}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Sección de aviso docente institucional */}
          <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 text-blue-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2 bg-blue-900 text-white rounded-lg shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Sistema preparado para registro de calificaciones
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Las asignaturas, evaluaciones y calificaciones ingresadas en cada curso se almacenan de forma segura e inmediata en la plataforma.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-semibold text-slate-700">En línea</span>
            </div>
          </section>
        </main>
      </div>

      {/* Modal de creación de curso */}
      <CursoModal
        isOpen={isCursoModalOpen}
        cursoToEdit={null}
        onClose={() => setIsCursoModalOpen(false)}
        onSuccess={(msg) => {
          setActiveNotice(msg);
          fetchCursos();
        }}
        onError={(msg) => {
          setActiveNotice(`Error: ${msg}`);
        }}
      />
    </div>
  );
}
