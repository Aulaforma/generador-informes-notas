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
} from "../StudentConsolidatedClient";
import { ReportCardView } from "@/components/ReportCardView";

interface StudentReportCardClientProps {
  courseId: string;
  studentId: string;
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

export function StudentReportCardClient({
  courseId,
  studentId,
  institution,
}: StudentReportCardClientProps) {
  const { profile, isLoading: authLoading } = useAuth();
  const isDocente = profile?.rol === "docente";

  // Estados de datos
  const [student, setStudent] = useState<DbStudent | null>(null);
  const [curso, setCurso] = useState<DbCursoWithDocente | null>(null);
  const [periodos, setPeriodos] = useState<DbPeriodo[]>([]);
  const [selectedPeriodo, setSelectedPeriodo] = useState<1 | 2 | "anual">(1);
  const [subjectRows, setSubjectRows] = useState<SubjectConsolidated[]>([]);
  const [generalAvgS1, setGeneralAvgS1] = useState<string>("-");
  const [generalAvgS2, setGeneralAvgS2] = useState<string>("-");
  const [generalAvgAnual, setGeneralAvgAnual] = useState<string>("En curso");

  // Estados visuales
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [studentNotFound, setStudentNotFound] = useState<boolean>(false);
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(false);

  // Carga de datos para la libreta de notas
  const loadReportCardData = useCallback(async () => {
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

      // 2. Obtener datos del curso y profesor jefe desde Supabase
      const { data: cursoData, error: cursoErr } = await supabase
        .from("cursos")
        .select(
          "id, nombre, nivel, letra, anio, activo, profesor_jefe_id, docentes(id, nombres, apellidos)"
        )
        .eq("id", stData.curso_id)
        .maybeSingle();

      if (cursoErr) {
        throw new Error(`Error al consultar curso en Supabase: ${cursoErr.message}`);
      }

      if (!cursoData) {
        throw new Error("No fue posible cargar la información del curso asociado al estudiante.");
      }

      if (!cursoData.anio) {
        throw new Error("El año escolar del curso no se encuentra disponible.");
      }

      const resolvedCurso: DbCursoWithDocente = cursoData as unknown as DbCursoWithDocente;
      setCurso(resolvedCurso);

      // 3. Validación de permisos (Requisito 12):
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

      // 4. Cargar períodos del año y respetar el período activo del sistema
      const courseYear = resolvedCurso.anio;
      const { data: periodosData, error: periodosErr } = await supabase
        .from("periodos")
        .select("id, numero, nombre, anio, activo, cerrado")
        .eq("anio", courseYear)
        .order("numero", { ascending: true });

      if (periodosErr) {
        throw new Error(`Error al consultar períodos en Supabase: ${periodosErr.message}`);
      }

      const loadedPeriodos = (periodosData as DbPeriodo[]) || [];
      setPeriodos(loadedPeriodos);

      // Si existe un período activo en el sistema, seleccionarlo por defecto
      const activePeriodo = loadedPeriodos.find((p) => p.activo);
      if (activePeriodo && (activePeriodo.numero === 1 || activePeriodo.numero === 2)) {
        setSelectedPeriodo(activePeriodo.numero as 1 | 2);
      } else if (loadedPeriodos.length > 0 && (loadedPeriodos[0].numero === 1 || loadedPeriodos[0].numero === 2)) {
        setSelectedPeriodo(loadedPeriodos[0].numero as 1 | 2);
      }

      // 5. Obtener asignaturas asociadas al curso mediante curso_asignaturas
      const { data: caData, error: caErr } = await supabase
        .from("curso_asignaturas")
        .select(
          "id, curso_id, asignatura_id, docente_id, incide_promedio, asignaturas(id, nombre, activo), docentes(id, nombres, apellidos, email, activo)"
        )
        .eq("curso_id", stData.curso_id)
        .order("asignatura_id", { ascending: true });

      if (caErr) {
        throw new Error(`Error al consultar asignaturas en Supabase: ${caErr.message}`);
      }

      const validCaRows = ((caData || []) as unknown as DbCursoAsignatura[]).filter(
        (ca) => ca.asignaturas && ca.asignaturas.nombre
      );
      const validCaIds = validCaRows.map((ca) => ca.id);

      // 6. Cargar todas las evaluaciones del año para las asignaturas del curso
      let currentEvals: DbEvaluacion[] = [];
      if (validCaIds.length > 0) {
        const { data: evalsData, error: evalsErr } = await supabase
          .from("evaluaciones")
          .select("id, curso_asignatura_id, nombre, periodo, orden, fecha")
          .in("curso_asignatura_id", validCaIds)
          .order("periodo", { ascending: true })
          .order("orden", { ascending: true });

        if (evalsErr) {
          throw new Error(`Error al consultar evaluaciones en Supabase: ${evalsErr.message}`);
        }

        currentEvals = (evalsData as DbEvaluacion[]) || [];
      }

      // 7. Cargar calificaciones del estudiante
      const evalIds = currentEvals.map((e) => e.id);
      const califsMap: Record<number, number> = {};

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
            if (c.nota !== null && c.nota !== undefined && !isNaN(c.nota) && c.nota > 0) {
              califsMap[c.evaluacion_id] = c.nota;
            }
          });
        }
      }

      // 8. Organizar datos por período
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

      // COMENTARIO TÉCNICO (Requisitos 4 y 11):
      // La libreta de notas muestra un máximo de 10 notas parciales por semestre en la vista impresa,
      // pero el promedio semestral y anual se calcula considerando la totalidad de las evaluaciones válidas
      // de la asignatura registradas en Supabase (incluso si existen más de 10).
      let maxColsS1 = 10;
      let maxColsS2 = 10;
      validCaRows.forEach((ca) => {
        const c1 = evalsByCaAndPeriod[ca.id][1].length;
        if (c1 > maxColsS1) maxColsS1 = c1;
        const c2 = evalsByCaAndPeriod[ca.id][2].length;
        if (c2 > maxColsS2) maxColsS2 = c2;
      });

      const rows: SubjectConsolidated[] = validCaRows.map((ca) => {
        const s1Detail = computeSemesterDetail(
          evalsByCaAndPeriod[ca.id][1],
          califsMap,
          maxColsS1,
          1
        );
        const s2Detail = computeSemesterDetail(
          evalsByCaAndPeriod[ca.id][2],
          califsMap,
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

      setSubjectRows(rows);

      // 9. Calcular promedios generales
      const { generalAvgS1, generalAvgS2, generalAvgAnual } = computeGeneralAverages(rows);
      setGeneralAvgS1(generalAvgS1);
      setGeneralAvgS2(generalAvgS2);
      setGeneralAvgAnual(generalAvgAnual);
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Error inesperado al generar la libreta desde Supabase."
      );
    } finally {
      setIsLoading(false);
    }
  }, [studentId, profile, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadReportCardData();
    }
  }, [loadReportCardData, authLoading]);

  const handlePrint = () => {
    window.print();
  };

  const studentFullName = student
    ? `${student.nombres} ${student.apellidos}`
    : "Estudiante";

  const courseDisplayName = curso?.nombre || "Cargando curso...";
  const schoolYear = curso?.anio || 0;

  const headTeacherDisplayName = curso?.docentes
    ? `Prof. ${curso.docentes.nombres} ${curso.docentes.apellidos}`
    : "Profesor(a) no asignado(a)";

  const currentPeriodoObj = periodos.find((p) => p.numero === selectedPeriodo);
  const currentPeriodoNombre =
    selectedPeriodo === "anual"
      ? "Resumen Anual"
      : currentPeriodoObj?.nombre ||
        (selectedPeriodo === 1 ? "Primer Semestre" : "Segundo Semestre");

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* ESTILOS DE IMPRESIÓN OFICIALES (Vertical para período individual / Horizontal para anual) */}
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
            size: ${selectedPeriodo === "anual" ? "letter landscape" : "letter portrait"};
            margin: 8mm;
          }
          .avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}} />

      {/* BARRA SUPERIOR DE ACCIONES WEB (Oculta al imprimir) */}
      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-40 px-4 sm:px-6 py-3 shadow-2xs">
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
              <Link
                href={`/cursos/${courseId}/estudiantes/${studentId}`}
                className="hover:text-blue-900 font-medium transition-colors"
              >
                Consolidado
              </Link>
              <span>/</span>
              <span className="text-slate-900 font-bold">Libreta Oficial</span>
            </nav>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>{studentFullName}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {currentPeriodoNombre}
              </span>
            </h1>
          </div>

          {/* CONTROLES: SELECTOR DE PERÍODO + ACCIÓN IMPRIMIR */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Selector de período */}
            <div className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSelectedPeriodo(1)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                  selectedPeriodo === 1
                    ? "bg-blue-900 text-white shadow-2xs"
                    : "text-slate-700 hover:text-blue-900 hover:bg-slate-100"
                }`}
              >
                1° Semestre
                {periodos.find((p) => p.numero === 1)?.activo && (
                  <span className="ml-1 text-[10px] opacity-80">(Activo)</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedPeriodo(2)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                  selectedPeriodo === 2
                    ? "bg-blue-900 text-white shadow-2xs"
                    : "text-slate-700 hover:text-blue-900 hover:bg-slate-100"
                }`}
              >
                2° Semestre
                {periodos.find((p) => p.numero === 2)?.activo && (
                  <span className="ml-1 text-[10px] opacity-80">(Activo)</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedPeriodo("anual")}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                  selectedPeriodo === "anual"
                    ? "bg-blue-900 text-white shadow-2xs"
                    : "text-slate-700 hover:text-blue-900 hover:bg-slate-100"
                }`}
              >
                Anual
              </button>
            </div>

            <Link
              href={`/cursos/${courseId}/estudiantes/${studentId}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-semibold shadow-2xs transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver</span>
            </Link>

            {/* BOTÓN OFICIAL DE IMPRESIÓN */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading || Boolean(loadError) || isUnauthorized || !student || !curso || !curso.anio}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-900"
              title="Imprimir libreta o guardar en PDF"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              <span>Imprimir libreta</span>
            </button>
          </div>
        </div>
      </header>

      {/* ÁREA DE CONTENIDO */}
      <main className="p-4 sm:p-6 lg:p-8">
        {/* CARGANDO */}
        {isLoading && (
          <div className="no-print max-w-xl mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
            <div className="w-10 h-10 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              Preparando Libreta de Notas con notas parciales...
            </h3>
            <p className="text-xs text-slate-500">
              Recuperando evaluaciones, calificaciones de ambos semestres y asignaturas desde Supabase.
            </p>
          </div>
        )}

        {/* ACCESO RESTRINGIDO (Requisito 12) */}
        {!isLoading && isUnauthorized && (
          <div className="no-print max-w-md mx-auto my-12 bg-white rounded-2xl border border-amber-200 p-8 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-amber-100 border border-amber-200 mx-auto flex items-center justify-center text-amber-700">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-11a4 4 0 00-8 0v4h8V6zM6 10h12a2 2 0 012 2v7a2 2 0 01-2 2H6a2 2 0 01-2-2v-7a2 2 0 012-2z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Acceso restringido a la libreta
            </h2>
            <p className="text-xs text-slate-600">
              La libreta de notas oficial solo puede ser generada por la Unidad Técnico Pedagógica (UTP) y por el Profesor Jefe de este curso.
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

        {/* ERROR */}
        {!isLoading && loadError && (
          <div className="no-print max-w-lg mx-auto my-12 bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-900 space-y-3 shadow-xs">
            <h3 className="font-bold text-base text-rose-950">
              Error al generar libreta de notas
            </h3>
            <p className="text-xs text-rose-800">{loadError}</p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={loadReportCardData}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Reintentar
              </button>
              <Link
                href={`/cursos/${courseId}/estudiantes/${studentId}`}
                className="px-4 py-2 bg-white border border-rose-300 text-rose-700 rounded-lg text-xs font-semibold"
              >
                Volver al consolidado
              </Link>
            </div>
          </div>
        )}

        {/* ESTUDIANTE NO ENCONTRADO */}
        {!isLoading && !loadError && studentNotFound && (
          <div className="no-print max-w-md mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
            <h3 className="text-lg font-bold text-slate-900">
              Estudiante no encontrado
            </h3>
            <p className="text-xs text-slate-500">
              No se encontró ningún estudiante con el identificador #{studentId}.
            </p>
            <Link
              href={`/cursos/${courseId}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 text-white text-xs font-bold"
            >
              Volver al curso
            </Link>
          </div>
        )}

        {/* VISTA PREVIA IMPRIMIBLE DE LA LIBRETA (ReportCardView) */}
        {!isLoading && !loadError && student && curso && Boolean(curso.anio) && (
          <div className="print-area overflow-x-auto">
            <ReportCardView
              studentName={studentFullName}
              studentListNumber={student.numero_lista}
              courseName={courseDisplayName}
              headTeacherName={headTeacherDisplayName}
              schoolYear={schoolYear}
              schoolName="Liceo Andrés Alcázar de Tucapel"
              city="Tucapel"
              subjectRows={subjectRows}
              generalAvgS1={generalAvgS1}
              generalAvgS2={generalAvgS2}
              generalAvgAnual={generalAvgAnual}
              periodoNumero={selectedPeriodo}
              periodoNombre={currentPeriodoNombre}
            />
          </div>
        )}
      </main>
    </div>
  );
}
