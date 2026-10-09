"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  InstitutionalInfo,
  DbStudent,
  DbCursoAsignatura,
  DbEvaluacion,
  DbCalificacion,
  DbPeriodo,
  DbDocente,
} from "@/types/dashboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  SubjectConsolidated,
  computeSemesterDetail,
  computeAnnualSubjectSummary,
  computeGeneralAverages,
} from "../estudiantes/[studentId]/StudentConsolidatedClient";
import { ReportCardView } from "@/components/ReportCardView";

interface CourseReportCardsClientProps {
  courseId: string;
  institution: InstitutionalInfo;
}

interface DbCursoWithDocente {
  id: number;
  nombre: string;
  nivel?: string;
  letra?: string;
  anio?: number;
  activo?: boolean;
  profesor_jefe_id?: number | null;
  docentes?: DbDocente | null;
}

interface StudentReportCardItem {
  student: DbStudent;
  subjectRows: SubjectConsolidated[];
  generalAvgS1: string;
  generalAvgS2: string;
  generalAvgAnual: string;
}

export function CourseReportCardsClient({
  courseId,
  institution,
}: CourseReportCardsClientProps) {
  const { profile, isLoading: authLoading } = useAuth();
  const isDocente = profile?.rol === "docente";

  // Estados de datos
  const [curso, setCurso] = useState<DbCursoWithDocente | null>(null);
  const [reportCards, setReportCards] = useState<StudentReportCardItem[]>([]);

  // Estados visuales
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [courseNotFound, setCourseNotFound] = useState<boolean>(false);
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(false);

  // Carga masiva eficiente sin patrón N+1
  const loadBatchReportCards = useCallback(async () => {
    if (authLoading) return;

    setIsLoading(true);
    setLoadError(null);
    setCourseNotFound(false);
    setIsUnauthorized(false);

    try {
      const targetId = (courseId || "").trim();
      const numId = parseInt(targetId, 10);
      const isNumeric = !isNaN(numId) && numId > 0 && String(numId) === targetId;

      let resolvedCurso: DbCursoWithDocente | null = null;

      // 1. Obtener datos del curso y profesor jefe (1 consulta)
      if (isNumeric) {
        const { data: cData, error: cErr } = await supabase
          .from("cursos")
          .select(
            "id, nombre, nivel, letra, anio, activo, profesor_jefe_id, docentes(id, nombres, apellidos)"
          )
          .eq("id", numId)
          .maybeSingle();

        if (cErr) {
          throw new Error(`Error al consultar curso: ${cErr.message}`);
        }
        if (cData) {
          resolvedCurso = cData as unknown as DbCursoWithDocente;
        }
      } else {
        const { data: allCursos, error: allErr } = await supabase
          .from("cursos")
          .select(
            "id, nombre, nivel, letra, anio, activo, profesor_jefe_id, docentes(id, nombres, apellidos)"
          );

        if (allErr) {
          throw new Error(`Error al consultar cursos: ${allErr.message}`);
        }

        if (allCursos && allCursos.length > 0) {
          const match = allCursos.find(
            (c) =>
              c.nombre.toLowerCase().replace(/\s+/g, "-") === targetId.toLowerCase() ||
              c.nombre.toLowerCase() === targetId.toLowerCase()
          );
          if (match) {
            resolvedCurso = match as unknown as DbCursoWithDocente;
          }
        }
      }

      if (!resolvedCurso) {
        setCourseNotFound(true);
        return;
      }

      setCurso(resolvedCurso);

      // 2. Validación de permisos (Requisito 2):
      // - UTP: acceso permitido
      // - Profesor Jefe: acceso permitido SOLO si cursos.profesor_jefe_id === profile.docente_id
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

      // 3. Obtener estudiantes ACTIVOS del curso (1 consulta, Requisito 4)
      const { data: studentsData, error: stErr } = await supabase
        .from("estudiantes")
        .select("id, numero_lista, nombres, apellidos, curso_id, activo")
        .eq("curso_id", resolvedCurso.id)
        .eq("activo", true)
        .order("numero_lista", { ascending: true });

      if (stErr) {
        throw new Error(`Error al consultar estudiantes activos: ${stErr.message}`);
      }

      const activeStudents: DbStudent[] = (studentsData as DbStudent[]) || [];

      // Si no hay estudiantes activos, terminar temprano
      if (activeStudents.length === 0) {
        setReportCards([]);
        setIsLoading(false);
        return;
      }

      // 4. Obtener períodos del año (1 consulta)
      const courseYear = resolvedCurso.anio || 2026;
      await supabase
        .from("periodos")
        .select("id, numero, nombre, anio, activo, cerrado")
        .eq("anio", courseYear)
        .order("numero", { ascending: true });

      // 5. Obtener asignaturas asociadas al curso (1 consulta)
      const { data: caData, error: caErr } = await supabase
        .from("curso_asignaturas")
        .select(
          "id, curso_id, asignatura_id, docente_id, incide_promedio, asignaturas(id, nombre, activo), docentes(id, nombres, apellidos, email, activo)"
        )
        .eq("curso_id", resolvedCurso.id)
        .order("asignatura_id", { ascending: true });

      if (caErr) {
        throw new Error(`Error al consultar asignaturas del curso: ${caErr.message}`);
      }

      const validCaRows = ((caData || []) as unknown as DbCursoAsignatura[]).filter(
        (ca) => ca.asignaturas && ca.asignaturas.nombre
      );
      const validCaIds = validCaRows.map((ca) => ca.id);

      // 6. Obtener todas las evaluaciones del curso para ambos semestres (1 consulta)
      let currentEvals: DbEvaluacion[] = [];
      if (validCaIds.length > 0) {
        const { data: evalsData, error: evalsErr } = await supabase
          .from("evaluaciones")
          .select("id, curso_asignatura_id, nombre, periodo, orden, fecha")
          .in("curso_asignatura_id", validCaIds)
          .order("periodo", { ascending: true })
          .order("orden", { ascending: true });

        if (evalsErr) {
          throw new Error(`Error al consultar evaluaciones del curso: ${evalsErr.message}`);
        }

        currentEvals = (evalsData as DbEvaluacion[]) || [];
      }

      // 7. Cargar calificaciones de TODOS los estudiantes activos por lote (1 consulta masiva)
      const studentIds = activeStudents.map((s) => s.id);
      const evalIds = currentEvals.map((e) => e.id);
      const califsByStudent: Record<number, Record<number, number>> = {};

      if (studentIds.length > 0 && evalIds.length > 0) {
        const { data: califsData, error: califsErr } = await supabase
          .from("calificaciones")
          .select("id, estudiante_id, evaluacion_id, nota")
          .in("estudiante_id", studentIds)
          .in("evaluacion_id", evalIds);

        if (califsErr) {
          throw new Error(`Error al consultar calificaciones en lote: ${califsErr.message}`);
        }

        if (califsData) {
          (califsData as DbCalificacion[]).forEach((c) => {
            if (c.nota !== null && c.nota !== undefined && !isNaN(c.nota) && c.nota > 0) {
              if (!califsByStudent[c.estudiante_id]) {
                califsByStudent[c.estudiante_id] = {};
              }
              califsByStudent[c.estudiante_id][c.evaluacion_id] = c.nota;
            }
          });
        }
      }

      // 8. Organizar evaluaciones por asignatura y período en memoria
      const evalsByCaAndPeriod: Record<number, { 1: DbEvaluacion[]; 2: DbEvaluacion[] }> = {};
      validCaRows.forEach((ca) => {
        evalsByCaAndPeriod[ca.id] = { 1: [], 2: [] };
      });

      currentEvals.forEach((ev) => {
        if (evalsByCaAndPeriod[ev.curso_asignatura_id]) {
          if (ev.periodo === 1) {
            evalsByCaAndPeriod[ev.curso_asignatura_id][1].push(ev);
          } else if (ev.periodo === 2) {
            evalsByCaAndPeriod[ev.curso_asignatura_id][2].push(ev);
          }
        }
      });

      // Asegurar mínimo 10 columnas por semestre para la libreta
      let maxColsS1 = 10;
      let maxColsS2 = 10;
      validCaRows.forEach((ca) => {
        const c1 = evalsByCaAndPeriod[ca.id][1].length;
        if (c1 > maxColsS1) maxColsS1 = c1;
        const c2 = evalsByCaAndPeriod[ca.id][2].length;
        if (c2 > maxColsS2) maxColsS2 = c2;
      });

      // 9. Construir en memoria la libreta para cada estudiante activo (Requisitos 6, 11 y 13)
      const computedCards: StudentReportCardItem[] = activeStudents.map((st) => {
        const studentCalifsMap = califsByStudent[st.id] || {};

        const subjectRows: SubjectConsolidated[] = validCaRows.map((ca) => {
          const s1Detail = computeSemesterDetail(
            evalsByCaAndPeriod[ca.id][1],
            studentCalifsMap,
            maxColsS1,
            1
          );
          const s2Detail = computeSemesterDetail(
            evalsByCaAndPeriod[ca.id][2],
            studentCalifsMap,
            maxColsS2,
            2
          );

          const annualSummary = computeAnnualSubjectSummary(s1Detail, s2Detail);

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
            incidePromedio: ca.incide_promedio !== false,
            semestre1: s1Detail,
            semestre2: s2Detail,
            promedioAnualNum: annualSummary.promedioAnualNum,
            promedioAnualText: annualSummary.promedioAnualText,
            esProvisional: annualSummary.esProvisional,
            esDefinitivo: annualSummary.esDefinitivo,
          };
        });

        const { generalAvgS1, generalAvgS2, generalAvgAnual } =
          computeGeneralAverages(subjectRows);

        return {
          student: st,
          subjectRows,
          generalAvgS1,
          generalAvgS2,
          generalAvgAnual,
        };
      });

      setReportCards(computedCards);
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Error inesperado al generar las libretas del curso."
      );
    } finally {
      setIsLoading(false);
    }
  }, [courseId, profile, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadBatchReportCards();
    }
  }, [loadBatchReportCards, authLoading]);

  const handlePrint = () => {
    window.print();
  };

  const courseDisplayName = curso?.nombre || "Curso";
  const schoolYear = curso?.anio || 2026;
  const headTeacherDisplayName = curso?.docentes
    ? `Prof. ${curso.docentes.nombres} ${curso.docentes.apellidos}`
    : "Profesor(a) no asignado(a)";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* ESTILOS DE IMPRESIÓN MASIVA (CARTA HORIZONTAL, SALTO ENTRE LIBRETAS) */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: letter landscape;
            margin: 8mm;
          }
          .report-card-page {
            break-after: page !important;
            page-break-after: always !important;
          }
          .report-card-page:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }
          .avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}} />

      {/* BARRA SUPERIOR INSTITUCIONAL (Oculta al imprimir) */}
      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-40 px-4 sm:px-6 py-3.5 shadow-2xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
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
              <span className="text-slate-900 font-bold">Libretas del Curso</span>
            </nav>
            <h1 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>Libretas del curso — {courseDisplayName}</span>
              {!isLoading && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-900 border border-blue-200">
                  {reportCards.length} estudiantes activos · Año {schoolYear}
                </span>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href={`/cursos/${courseId}`}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-semibold shadow-2xs transition-colors"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver al curso</span>
            </Link>

            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading || Boolean(loadError) || isUnauthorized || reportCards.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-900"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              <span>Imprimir / Guardar PDF ({reportCards.length})</span>
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="p-4 sm:p-6 lg:p-8">
        {/* CARGANDO */}
        {isLoading && (
          <div className="no-print max-w-xl mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
            <div className="w-10 h-10 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              Preparando libretas del curso...
            </h3>
            <p className="text-xs text-slate-500">
              Recuperando calificaciones de todos los estudiantes activos en un solo lote optimizado.
            </p>
          </div>
        )}

        {/* ACCESO RESTRINGIDO (Requisito 2) */}
        {!isLoading && isUnauthorized && (
          <div className="no-print max-w-md mx-auto my-12 bg-white rounded-2xl border border-amber-200 p-8 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-amber-100 border border-amber-200 mx-auto flex items-center justify-center text-amber-700">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-11a4 4 0 00-8 0v4h8V6zM6 10h12a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2v-7a2 2 0 012-2z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Acceso restringido a las libretas del curso
            </h2>
            <p className="text-xs text-slate-600">
              La generación masiva de libretas de notas solo está disponible para la Unidad Técnico Pedagógica (UTP) y para el Profesor Jefe de este curso.
            </p>
            <div className="pt-2">
              <Link
                href={`/cursos/${courseId}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0f2942] hover:bg-[#163a5f] text-white text-xs font-bold transition-colors"
              >
                Volver al curso
              </Link>
            </div>
          </div>
        )}

        {/* CURSO NO ENCONTRADO */}
        {!isLoading && !loadError && courseNotFound && (
          <div className="no-print max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
            <h3 className="text-lg font-bold text-slate-900">
              Curso no encontrado
            </h3>
            <p className="text-xs text-slate-500">
              No se encontró ningún curso con el identificador &quot;{courseId}&quot;.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 text-white text-xs font-bold"
            >
              Volver al panel principal
            </Link>
          </div>
        )}

        {/* ERROR */}
        {!isLoading && loadError && (
          <div className="no-print max-w-lg mx-auto my-12 bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-900 space-y-3 shadow-xs">
            <h3 className="font-bold text-base text-rose-950">
              Error al generar las libretas del curso
            </h3>
            <p className="text-xs text-rose-800">{loadError}</p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={loadBatchReportCards}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Reintentar
              </button>
              <Link
                href={`/cursos/${courseId}`}
                className="px-4 py-2 bg-white border border-rose-300 text-rose-700 rounded-lg text-xs font-semibold"
              >
                Volver al curso
              </Link>
            </div>
          </div>
        )}

        {/* SIN ESTUDIANTES ACTIVOS */}
        {!isLoading && !loadError && !isUnauthorized && !courseNotFound && reportCards.length === 0 && (
          <div className="no-print max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 mx-auto flex items-center justify-center text-slate-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Sin estudiantes activos
            </h3>
            <p className="text-xs text-slate-500">
              No existen estudiantes activos para generar libretas en este curso.
            </p>
            <Link
              href={`/cursos/${courseId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 text-white text-xs font-bold"
            >
              Volver al curso
            </Link>
          </div>
        )}

        {/* LISTADO DE LIBRETAS EN PÁGINAS INDIVIDUALES (Reutilizando ReportCardView) */}
        {!isLoading && !loadError && !isUnauthorized && reportCards.length > 0 && curso && (
          <div className="space-y-8 print:space-y-0">
            {reportCards.map((item) => {
              const fullName = `${item.student.nombres} ${item.student.apellidos}`;

              return (
                <div
                  key={item.student.id}
                  className="report-card-page mb-8 print:mb-0"
                >
                  <ReportCardView
                    studentName={fullName}
                    studentListNumber={item.student.numero_lista}
                    courseName={courseDisplayName}
                    headTeacherName={headTeacherDisplayName}
                    schoolYear={schoolYear}
                    schoolName="Liceo Andrés Alcázar de Tucapel"
                    city="Tucapel"
                    subjectRows={item.subjectRows}
                    generalAvgS1={item.generalAvgS1}
                    generalAvgS2={item.generalAvgS2}
                    generalAvgAnual={item.generalAvgAnual}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
