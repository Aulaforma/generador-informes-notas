"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  InstitutionalInfo,
  NavSection,
  DbStudent,
  DbCursoAsignatura,
  DbEvaluacion,
  DbCalificacion,
} from "@/types/dashboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface StudentConsolidatedClientProps {
  courseId: string;
  studentId: string;
  institution: InstitutionalInfo;
}


interface ConsolidatedCell {
  evalId: number | null;
  evalNombre: string;
  notaNum: number | null;
  display: string;
}

interface ConsolidatedRow {
  asignaturaId: number;
  asignaturaNombre: string;
  docente: string;
  notas: ConsolidatedCell[];
  promedioText: string;
  promedioNum: number | null;
}

interface DbCursoInfo {
  id: number;
  nombre: string;
  nivel?: string;
  letra?: string;
  anio?: number;
  profesor_jefe_id?: number | null;
}

export function StudentConsolidatedClient({
  courseId,
  studentId,
  institution,
}: StudentConsolidatedClientProps) {
  const [currentSection, setCurrentSection] = useState<NavSection>("estudiantes");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const { profile, isLoading: authLoading } = useAuth();
  const isDocente = profile?.rol === "docente";

  // Estados de datos obtenidos de Supabase
  const [student, setStudent] = useState<DbStudent | null>(null);
  const [curso, setCurso] = useState<DbCursoInfo | null>(null);
  const [columnHeaders, setColumnHeaders] = useState<string[]>([]);
  const [consolidatedRows, setConsolidatedRows] = useState<ConsolidatedRow[]>([]);
  const [generalAverage, setGeneralAverage] = useState<string>("-");

  // Estados visuales: carga, error, no encontrado y acceso no autorizado
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [studentNotFound, setStudentNotFound] = useState<boolean>(false);
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(false);

  // Carga completa de consolidado desde Supabase
  const loadConsolidatedData = useCallback(async () => {
    if (authLoading) return;

    setIsLoading(true);
    setLoadError(null);
    setStudentNotFound(false);
    setIsUnauthorized(false);

    try {
      const numericStudentId = parseInt(studentId, 10);
      if (isNaN(numericStudentId)) {
        throw new Error(`El ID de estudiante "${studentId}" no es válido.`);
      }

      // 1. Obtener datos del estudiante desde Supabase
      const { data: stData, error: stErr } = await supabase
        .from("estudiantes")
        .select("id, numero_lista, nombres, apellidos, curso_id, activo")
        .eq("id", numericStudentId)
        .maybeSingle();

      if (stErr) {
        throw new Error(`Error al consultar estudiante en Supabase: ${stErr.message}`);
      }

      if (!stData) {
        setStudentNotFound(true);
        setStudent(null);
        return;
      }

      setStudent(stData as DbStudent);

      // 2. Obtener datos del curso desde Supabase (incluyendo profesor_jefe_id)
      const { data: cursoData, error: cursoErr } = await supabase
        .from("cursos")
        .select("id, nombre, nivel, letra, anio, activo, profesor_jefe_id")
        .eq("id", stData.curso_id)
        .maybeSingle();

      if (cursoErr) {
        throw new Error(`Error al consultar curso en Supabase: ${cursoErr.message}`);
      }

      const resolvedCurso: DbCursoInfo = (cursoData as DbCursoInfo) || {
        id: stData.curso_id,
        nombre: "7° Básico A",
        anio: 2026,
        profesor_jefe_id: null,
      };

      setCurso(resolvedCurso);

      // 3. Validación de permisos:
      // - UTP: acceso permitido a todos los cursos y estudiantes
      // - Profesor Jefe: acceso permitido SOLAMENTE al curso donde cursos.profesor_jefe_id === profile.docente_id
      // - Docente normal u otro: BLOQUEADO ("Acceso restringido")
      const isUserUtp = profile?.rol === "utp";
      const isUserProfJefe =
        profile?.rol === "docente" &&
        Boolean(profile.docente_id) &&
        resolvedCurso.profesor_jefe_id === profile.docente_id;

      if (!isUserUtp && !isUserProfJefe) {
        setIsUnauthorized(true);
        setIsLoading(false);
        return;
      }

      // 4. Obtener asignaturas asociadas a su curso mediante curso_asignaturas y sus docentes asociados
      const { data: caData, error: caErr } = await supabase
        .from("curso_asignaturas")
        .select(
          "id, curso_id, asignatura_id, docente_id, asignaturas(id, nombre, activo), docentes(id, nombres, apellidos, email, activo)"
        )
        .eq("curso_id", stData.curso_id)
        .order("asignatura_id", { ascending: true });

      if (caErr) {
        throw new Error(
          `Error al consultar asignaturas del curso en Supabase: ${caErr.message}`
        );
      }

      const validCaRows = ((caData || []) as unknown as DbCursoAsignatura[]).filter(
        (ca) => ca.asignaturas && ca.asignaturas.nombre
      );

      const caIds = validCaRows.map((ca) => ca.id);

      // 4. Obtener evaluaciones correspondientes al periodo 2 (Segundo semestre)
      let currentEvals: DbEvaluacion[] = [];
      if (caIds.length > 0) {
        const { data: evalsData, error: evalsErr } = await supabase
          .from("evaluaciones")
          .select("id, curso_asignatura_id, nombre, periodo, orden, fecha")
          .in("curso_asignatura_id", caIds)
          .eq("periodo", 2)
          .order("orden", { ascending: true });

        if (evalsErr) {
          throw new Error(`Error al consultar evaluaciones en Supabase: ${evalsErr.message}`);
        }

        currentEvals = (evalsData as DbEvaluacion[]) || [];
      }

      // Agrupar evaluaciones por curso_asignatura_id
      const evalsByCa: { [caId: number]: DbEvaluacion[] } = {};
      currentEvals.forEach((ev) => {
        if (!evalsByCa[ev.curso_asignatura_id]) {
          evalsByCa[ev.curso_asignatura_id] = [];
        }
        evalsByCa[ev.curso_asignatura_id].push(ev);
      });

      // 5. Obtener calificaciones del estudiante desde "calificaciones"
      const evalIds = currentEvals.map((e) => e.id);
      const califsMap: { [evalId: number]: number } = {};

      if (evalIds.length > 0) {
        const { data: califsData, error: califsErr } = await supabase
          .from("calificaciones")
          .select("id, estudiante_id, evaluacion_id, nota")
          .eq("estudiante_id", stData.id)
          .in("evaluacion_id", evalIds);

        if (califsErr) {
          throw new Error(`Error al consultar calificaciones en Supabase: ${califsErr.message}`);
        }

        if (califsData) {
          (califsData as DbCalificacion[]).forEach((c) => {
            if (c.nota !== null && c.nota !== undefined && !isNaN(c.nota)) {
              califsMap[c.evaluacion_id] = c.nota;
            }
          });
        }
      }

      // 6. Construir dinámicamente las columnas de evaluación (mínimo 3: Nota 1, Nota 2, Nota 3)
      let maxEvalsCount = 3;
      validCaRows.forEach((ca) => {
        const list = evalsByCa[ca.id] || [];
        if (list.length > maxEvalsCount) {
          maxEvalsCount = list.length;
        }
      });

      const dynamicHeaders: string[] = Array.from(
        { length: maxEvalsCount },
        (_, i) => `Nota ${i + 1}`
      );
      setColumnHeaders(dynamicHeaders);

      // 7. Construir dinámicamente las filas de asignaturas con sus notas y promedios
      const rows: ConsolidatedRow[] = validCaRows.map((ca) => {
        const caEvals = evalsByCa[ca.id] || [];
        const notasCells: ConsolidatedCell[] = [];
        const validGrades: number[] = [];

        for (let colIdx = 0; colIdx < maxEvalsCount; colIdx++) {
          const ev = caEvals[colIdx];
          if (ev) {
            const notaVal = califsMap[ev.id];
            if (notaVal !== undefined && notaVal !== null) {
              notasCells.push({
                evalId: ev.id,
                evalNombre: ev.nombre,
                notaNum: notaVal,
                display: notaVal.toFixed(1).replace(".", ","),
              });
              validGrades.push(notaVal);
            } else {
              notasCells.push({
                evalId: ev.id,
                evalNombre: ev.nombre,
                notaNum: null,
                display: "-",
              });
            }
          } else {
            notasCells.push({
              evalId: null,
              evalNombre: `Nota ${colIdx + 1}`,
              notaNum: null,
              display: "-",
            });
          }
        }

        // Calcular promedio de la asignatura con notas existentes
        let promedioText = "-";
        let promedioNum: number | null = null;

        if (validGrades.length > 0) {
          const sum = validGrades.reduce((acc, curr) => acc + curr, 0);
          const avg = sum / validGrades.length;
          // Redondeo estándar a 1 decimal
          const rounded = Math.round(avg * 10) / 10;
          promedioText = rounded.toFixed(1).replace(".", ",");
          promedioNum = rounded;
        }

        const asigNombre = ca.asignaturas.nombre;
        let docenteAsignado = "Docente no asignado";
        if (ca.docente_id !== null && ca.docente_id !== undefined) {
          if (ca.docentes) {
            docenteAsignado = `Prof. ${ca.docentes.nombres} ${ca.docentes.apellidos}`;
          } else {
            docenteAsignado = "Docente no disponible";
          }
        }

        return {
          asignaturaId: ca.asignatura_id,
          asignaturaNombre: asigNombre,
          docente: docenteAsignado,
          notas: notasCells,
          promedioText,
          promedioNum,
        };
      });

      setConsolidatedRows(rows);

      // 8. Calcular el promedio general del estudiante
      const validSubjectAverages = rows
        .map((r) => r.promedioNum)
        .filter((v): v is number => v !== null);

      if (validSubjectAverages.length > 0) {
        const genSum = validSubjectAverages.reduce((acc, curr) => acc + curr, 0);
        const genAvg = Math.round((genSum / validSubjectAverages.length) * 10) / 10;
        setGeneralAverage(genAvg.toFixed(1).replace(".", ","));
      } else {
        setGeneralAverage("-");
      }
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Error inesperado al recuperar el consolidado desde Supabase."
      );
    } finally {
      setIsLoading(false);
    }
  }, [studentId, profile, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadConsolidatedData();
    }
  }, [loadConsolidatedData, authLoading]);

  const handlePreviewClick = () => {
    setPreviewNotice(
      "La vista previa e impresión de la libreta escolar oficial estará disponible en la siguiente etapa."
    );
    setTimeout(() => {
      setPreviewNotice(null);
    }, 4500);
  };

  const studentFullName = student
    ? `${student.nombres} ${student.apellidos}`
    : "Estudiante";

  const courseDisplayName = curso?.nombre || "7° Básico A";
  const schoolYear = curso?.anio || 2026;
  const periodText = "Segundo semestre";

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Barra lateral institucional */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={(section) => setCurrentSection(section)}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Contenedor principal */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        {/* Cabecera institucional */}
        <Header
          institution={institution}
          onOpenMobileSidebar={() => setIsMobileMenuOpen(true)}
        />

        {/* Notificación informativa para "Vista previa de libreta" */}
        {previewNotice && (
          <div className="fixed top-20 right-4 z-50 max-w-md bg-blue-950 text-white px-4 py-3 rounded-xl shadow-lg border border-blue-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-800 flex items-center justify-center shrink-0 text-blue-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="text-xs">
              <p className="font-semibold text-blue-200">Aviso Institucional</p>
              <p className="text-slate-200">{previewNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewNotice(null)}
              className="ml-auto text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Vista Bloqueada por Autorización: Solo UTP o Profesor Jefe del curso */}
        {!isLoading && isUnauthorized ? (
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-3xl w-full mx-auto flex flex-col justify-center items-center">
            <div className="w-full bg-white rounded-2xl border border-amber-200/90 p-8 sm:p-12 shadow-xs text-center space-y-5 my-auto">
              <div className="w-16 h-16 rounded-full bg-amber-100 border border-amber-200 mx-auto flex items-center justify-center text-amber-700">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-11a4 4 0 00-8 0v4h8V6zM6 10h12a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2v-7a2 2 0 012-2z" />
                </svg>
              </div>

              <div className="space-y-2">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                  Acceso Restringido
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Acceso restringido al consolidado
                </h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  El consolidado completo de calificaciones por estudiante solo está disponible para la Unidad Técnico Pedagógica (UTP) y para el Profesor Jefe de este curso.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href={`/cursos/${courseId}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0f2942] hover:bg-[#163a5f] text-white text-xs font-bold shadow-xs transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Volver al curso</span>
                </Link>
              </div>
            </div>
          </main>
        ) : (
          /* Contenido principal */
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
            {/* Navegación y Botón Volver al curso (Requisito 12) */}
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Link href="/" className="hover:text-blue-900 font-medium transition-colors">
                  {isDocente ? "Panel Docente" : "Panel UTP"}
                </Link>
                <span>/</span>
                <Link
                  href={`/cursos/${courseId}`}
                  className="hover:text-blue-900 font-medium transition-colors"
                >
                  {courseDisplayName}
                </Link>
                <span>/</span>
                <span className="text-slate-900 font-semibold">Consolidado Estudiante</span>
              </div>

            <Link
              href={`/cursos/${courseId}`}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-semibold shadow-2xs transition-colors"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver al curso</span>
            </Link>
          </nav>

          {/* ESTADO VISUAL: CARGA */}
          {isLoading && (
            <div className="space-y-6 animate-pulse">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="w-14 h-14 rounded-2xl bg-slate-200 shrink-0"></div>
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-slate-200 rounded w-48"></div>
                    <div className="h-6 bg-slate-200 rounded w-64"></div>
                    <div className="h-3 bg-slate-200 rounded w-36"></div>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="h-12 w-28 bg-slate-100 rounded-xl"></div>
                  <div className="h-12 w-28 bg-slate-100 rounded-xl"></div>
                  <div className="h-12 w-32 bg-blue-100 rounded-xl"></div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
                <div className="w-10 h-10 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-sm font-semibold text-slate-700">
                  Cargando consolidado del estudiante desde Supabase...
                </p>
                <p className="text-xs text-slate-400">
                  Consultando calificaciones, evaluaciones y asignaturas oficiales.
                </p>
              </div>
            </div>
          )}

          {/* ESTADO VISUAL: ERROR */}
          {!isLoading && loadError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-900 space-y-4 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-base text-rose-950">
                    Error al cargar consolidado desde Supabase
                  </h3>
                  <p className="text-sm text-rose-800 mt-1">{loadError}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={loadConsolidatedData}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Reintentar consulta
                </button>
                <Link
                  href={`/cursos/${courseId}`}
                  className="px-4 py-2 bg-white border border-rose-300 text-rose-700 hover:bg-rose-100/50 rounded-lg text-xs font-semibold transition-colors"
                >
                  Volver al curso
                </Link>
              </div>
            </div>
          )}

          {/* ESTADO VISUAL: AUSENCIA DE INFORMACIÓN (ESTUDIANTE NO ENCONTRADO) */}
          {!isLoading && !loadError && studentNotFound && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center space-y-4 max-w-xl mx-auto shadow-xs">
              <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Estudiante no encontrado en Supabase
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  No se encontró ningún estudiante con el identificador #{studentId} en la base de datos institucional.
                </p>
              </div>
              <Link
                href={`/cursos/${courseId}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-colors"
              >
                Volver a la nómina del curso
              </Link>
            </div>
          )}

          {/* VISTA PRINCIPAL CON DATOS REALES DE SUPABASE */}
          {!isLoading && !loadError && student && (
            <>
              {/* FICHA PRINCIPAL DEL ESTUDIANTE:
                  - Nombre completo del estudiante (Requisito 4)
                  - Curso (Requisito 4)
                  - Año escolar 2026 (Requisito 4)
                  - Segundo semestre (Requisito 4)
              */}
              <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#0f2942] text-white flex items-center justify-center text-xl font-extrabold shadow-sm shrink-0">
                      {student.numero_lista}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-900 text-white">
                          Curso: {courseDisplayName}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                          N.º de Lista: {student.numero_lista}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          ID Supabase: #{student.id}
                        </span>
                      </div>

                      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                        {studentFullName}
                      </h2>

                      <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Consolidado individual de calificaciones por asignatura · {institution.schoolName}
                      </p>
                    </div>
                  </div>

                  {/* Bloque de parámetros institucionales y Promedio General */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center min-w-[110px]">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Año escolar
                      </span>
                      <span className="text-base font-extrabold text-slate-900">
                        {schoolYear}
                      </span>
                    </div>

                    <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center min-w-[130px]">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Periodo
                      </span>
                      <span className="text-base font-extrabold text-slate-900">
                        {periodText}
                      </span>
                    </div>

                    {/* Promedio General del Estudiante */}
                    <div className="bg-blue-50 px-4 py-2.5 rounded-xl border border-blue-200 text-center min-w-[130px]">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 block">
                        Promedio General
                      </span>
                      <span className="text-xl font-black text-blue-950">
                        {generalAverage}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Barra de herramientas: Botón Vista previa de libreta (Requisito 13) */}
                <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="text-xs text-slate-500">
                    Calificaciones recuperadas en tiempo real desde Supabase para el periodo lectivo oficial.
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handlePreviewClick}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span>Vista previa de libreta</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* TABLA DE CONSOLIDADO POR ASIGNATURA (Requisitos 5, 6, 7, 9, 10, 11) */}
              <section className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                {consolidatedRows.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    No se encontraron asignaturas vinculadas a este curso en Supabase.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className="bg-[#0f2942] text-white text-xs font-semibold uppercase tracking-wider select-none">
                        <tr>
                          <th scope="col" className="px-6 py-3.5 min-w-[260px] border-r border-[#162a45]">
                            Asignatura
                          </th>
                          {columnHeaders.map((headerText, colIdx) => (
                            <th
                              key={colIdx}
                              scope="col"
                              className="px-3 py-3.5 w-24 text-center border-r border-[#162a45] bg-[#0b2138]"
                            >
                              <span>{headerText}</span>
                            </th>
                          ))}
                          <th scope="col" className="px-5 py-3.5 w-28 text-center bg-[#081729]">
                            <span className="text-blue-200">Promedio</span>
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-200 text-slate-800">
                        {consolidatedRows.map((row) => {
                          const isFailing = row.promedioNum !== null && row.promedioNum < 4.0;

                          return (
                            <tr
                              key={row.asignaturaId}
                              className="hover:bg-blue-50/20 transition-colors"
                            >
                              {/* Nombre de la Asignatura y Docente */}
                              <td className="px-6 py-4 border-r border-slate-200">
                                <div>
                                  <span className="font-bold text-slate-900 text-sm block">
                                    {row.asignaturaNombre}
                                  </span>
                                  <span className="text-xs text-slate-500 mt-0.5 block">
                                    Docente: {row.docente}
                                  </span>
                                </div>
                              </td>

                              {/* Columnas dinámicas de evaluaciones desde Supabase */}
                              {row.notas.map((cell, colIdx) => {
                                const isRed = cell.notaNum !== null && cell.notaNum < 4.0;

                                return (
                                  <td
                                    key={colIdx}
                                    className="px-3 py-4 text-center border-r border-slate-200 font-bold text-sm"
                                  >
                                    <span
                                      className={`inline-block px-2.5 py-1 rounded-md text-xs sm:text-sm ${
                                        cell.display === "-"
                                          ? "text-slate-400 font-normal"
                                          : isRed
                                          ? "text-rose-700 bg-rose-50 border border-rose-200 font-extrabold"
                                          : "text-blue-950 font-extrabold"
                                      }`}
                                    >
                                      {cell.display}
                                    </span>
                                  </td>
                                );
                              })}

                              {/* Promedio de la asignatura (Requisito 10 y 11) */}
                              <td className="px-5 py-4 text-center bg-slate-50/70">
                                <span
                                  className={`inline-block px-3 py-1 rounded-md text-xs sm:text-sm font-extrabold ${
                                    isFailing
                                      ? "text-rose-700 bg-rose-100 border border-rose-200"
                                      : row.promedioNum !== null
                                      ? "text-blue-900 bg-blue-100/80 border border-blue-200"
                                      : "text-slate-400 font-normal"
                                  }`}
                                >
                                  {row.promedioText}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>

                      {/* Fila final con Promedio General Ponderado */}
                      <tfoot className="bg-slate-100/90 font-bold border-t-2 border-slate-300 text-slate-900 text-xs sm:text-sm">
                        <tr>
                          <td
                            colSpan={columnHeaders.length + 1}
                            className="px-6 py-3.5 text-right uppercase tracking-wider text-slate-600 border-r border-slate-200"
                          >
                            Promedio General del Alumno:
                          </td>
                          <td className="px-5 py-3.5 text-center bg-blue-900 text-white font-extrabold text-sm">
                            {generalAverage}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Pie de tabla informativo */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-3">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-900 inline-block"></span>
                      Aprobado (≥ 4,0)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
                      Insuficiente (&lt; 4,0)
                    </span>
                  </div>

                  <span>
                    Total asignaturas oficiales: <strong>{consolidatedRows.length}</strong> · Régimen Escolar {schoolYear}
                  </span>
                </div>
              </section>
            </>
          )}
        </main>
        )}

        {/* Pie de página institucional */}
        <footer className="mt-auto border-t border-slate-200/80 bg-white py-4 px-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              © {schoolYear} {institution.schoolName} — Consolidado Académico
            </span>
            <span className="text-slate-400">
              {courseDisplayName} {student ? `· ${studentFullName}` : ""}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
