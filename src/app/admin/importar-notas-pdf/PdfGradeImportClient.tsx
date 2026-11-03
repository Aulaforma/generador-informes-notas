"use client";

import React, { useState, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import { InstitutionalInfo, NavSection } from "@/types/dashboard";
import { parsePdfGrades } from "@/utils/pdfGradeParser";
import { supabase } from "@/lib/supabase";
import {
  ValidatedPdfReport,
  SystemStudentMatch,
  SystemCourseSubject,
  StudentMatchStatus,
  matchSubjectToCourse,
  compareCourses,
  SubjectComparisonItem,
  RawEvaluation,
  RawCalificacion,
  computeGradesAnalysis,
  computeOverallPdfStatus,
  GradePositionStatus,
} from "@/utils/pdfCrossValidation";

interface PdfGradeImportClientProps {
  institution: InstitutionalInfo;
}

export function PdfGradeImportClient({ institution }: PdfGradeImportClientProps) {
  const { profile, isLoading: authLoading } = useAuth();
  const isUtp = profile?.rol === "utp";

  const [currentSection] = useState<NavSection>("importar-notas-pdf");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Estados de carga y validación
  const [isProcessing, setIsProcessing] = useState(false);
  const [reports, setReports] = useState<ValidatedPdfReport[]>([]);
  const [selectedReportIndex, setSelectedReportIndex] = useState<number | null>(null);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSubjectExpansion = (key: string) => {
    setExpandedSubjects((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Función para cruzar con Supabase (SELECT únicamente)
  const validatePdfWithSupabase = async (
    fileBuffer: ArrayBuffer,
    fileName: string,
    fileSize: number
  ): Promise<ValidatedPdfReport> => {
    // 1. Extraer datos con el parser de PDF
    const parsed = await parsePdfGrades(fileBuffer, fileName, fileSize);

    if (parsed.status === "PDF_SIN_TEXTO") {
      return {
        fileName,
        fileSize,
        overallStatus: "PDF_SIN_TEXTO",
        statusMessage: parsed.statusMessage,
        estudiantePdf: parsed.estudiante,
        runPdf: parsed.run,
        dvPdf: parsed.dv,
        rawRunPdf: parsed.rawRun,
        studentMatchStatus: "ERROR",
        systemStudent: null,
        cursoPdf: parsed.curso,
        cursoPdfNormalizado: parsed.cursoNormalizado,
        courseMatchStatus: "ERROR",
        systemCourse: null,
        subjects: [],
        availableCourseSubjects: [],
        totalNotasPeriodo1: 0,
        notasNuevasCount: 0,
        notasDuplicadasCount: 0,
        notasConflictosCount: 0,
        evaluacionesFaltantesCount: 0,
      };
    }

    if (parsed.status === "ERROR_DE_FORMATO") {
      return {
        fileName,
        fileSize,
        overallStatus: "ERROR",
        statusMessage: parsed.statusMessage,
        estudiantePdf: parsed.estudiante,
        runPdf: parsed.run,
        dvPdf: parsed.dv,
        rawRunPdf: parsed.rawRun,
        studentMatchStatus: "ERROR",
        systemStudent: null,
        cursoPdf: parsed.curso,
        cursoPdfNormalizado: parsed.cursoNormalizado,
        courseMatchStatus: "ERROR",
        systemCourse: null,
        subjects: [],
        availableCourseSubjects: [],
        totalNotasPeriodo1: 0,
        notasNuevasCount: 0,
        notasDuplicadasCount: 0,
        notasConflictosCount: 0,
        evaluacionesFaltantesCount: 0,
      };
    }

    // 2. Consulta A: Buscar estudiante en Supabase por RUN exacto
    let systemStudent: SystemStudentMatch | null = null;
    let studentMatchStatus: StudentMatchStatus = "REVISAR";

    if (parsed.run) {
      try {
        const { data: stData, error: stErr } = await supabase
          .from("estudiantes")
          .select("id, nombres, apellidos, run, dv, curso_id, activo, cursos(id, nombre, nivel, letra)")
          .eq("run", parsed.run)
          .maybeSingle();

        if (!stErr && stData) {
          systemStudent = stData as unknown as SystemStudentMatch;
          studentMatchStatus = "ENCONTRADO";
        } else {
          studentMatchStatus = "ERROR";
        }
      } catch {
        studentMatchStatus = "ERROR";
      }
    } else {
      studentMatchStatus = "REVISAR";
    }

    // 3. Consulta B: Comparar curso del PDF con curso del estudiante
    const systemCourse = systemStudent?.cursos || null;
    const courseMatchStatus = compareCourses(parsed.curso, systemCourse);

    // 4. Consulta C: Obtener asignaturas asociadas al curso del estudiante
    let availableCourseSubjects: SystemCourseSubject[] = [];
    if (systemStudent?.curso_id) {
      try {
        const { data: caData, error: caErr } = await supabase
          .from("curso_asignaturas")
          .select("id, curso_id, asignatura_id, incide_promedio, asignaturas(id, nombre, activo)")
          .eq("curso_id", systemStudent.curso_id);

        if (!caErr && caData) {
          availableCourseSubjects = caData as unknown as SystemCourseSubject[];
        }
      } catch (err) {
        console.error("Error al consultar asignaturas del curso:", err);
      }
    }

    // 5. Comparar cada asignatura del PDF con las asignaturas del curso
    const comparisonSubjects: SubjectComparisonItem[] = parsed.asignaturas.map((asig) => {
      if (asig.isConceptual) {
        return {
          asignaturaPdf: asig.asignatura,
          notasPeriodo1: asig.notasPeriodo1,
          promedioInformado: asig.promedioInformado,
          isConceptual: true,
          conceptualNotas: asig.conceptualNotas,
          cursoAsignaturaId: null,
          asignaturaSistemaId: null,
          asignaturaSistemaNombre: null,
          status: "CONCEPTUAL_OMITIDA",
          statusMessage: "Conceptual — omitida en esta etapa",
          gradesAnalysis: [],
        };
      }

      // Si no tenemos asignaturas del curso, queda pendiente
      if (availableCourseSubjects.length === 0) {
        return {
          asignaturaPdf: asig.asignatura,
          notasPeriodo1: asig.notasPeriodo1,
          promedioInformado: asig.promedioInformado,
          isConceptual: false,
          cursoAsignaturaId: null,
          asignaturaSistemaId: null,
          asignaturaSistemaNombre: null,
          status: "MANUAL",
          statusMessage: "Curso sin asignaturas asociadas o estudiante no vinculado",
          gradesAnalysis: [],
        };
      }

      const match = matchSubjectToCourse(asig.asignatura, availableCourseSubjects);

      if (match.isExact && match.matchedSubject) {
        return {
          asignaturaPdf: asig.asignatura,
          notasPeriodo1: asig.notasPeriodo1,
          promedioInformado: asig.promedioInformado,
          isConceptual: false,
          cursoAsignaturaId: match.matchedSubject.id,
          asignaturaSistemaId: match.matchedSubject.asignatura_id,
          asignaturaSistemaNombre: match.matchedSubject.asignaturas.nombre,
          status: "VINCULADA",
          statusMessage: "Vinculación exacta",
          gradesAnalysis: [],
        };
      }

      if (match.isSuggested && match.matchedSubject) {
        // Sugerencia encontrada, preseleccionamos pero permitimos cambio
        return {
          asignaturaPdf: asig.asignatura,
          notasPeriodo1: asig.notasPeriodo1,
          promedioInformado: asig.promedioInformado,
          isConceptual: false,
          cursoAsignaturaId: match.matchedSubject.id,
          asignaturaSistemaId: match.matchedSubject.asignatura_id,
          asignaturaSistemaNombre: match.matchedSubject.asignaturas.nombre,
          status: "VINCULADA",
          statusMessage: `Sugerida por alias (${match.matchedSubject.asignaturas.nombre})`,
          sugerenciaId: match.matchedSubject.id,
          gradesAnalysis: [],
        };
      }

      return {
        asignaturaPdf: asig.asignatura,
        notasPeriodo1: asig.notasPeriodo1,
        promedioInformado: asig.promedioInformado,
        isConceptual: false,
        cursoAsignaturaId: null,
        asignaturaSistemaId: null,
        asignaturaSistemaNombre: null,
        status: "MANUAL",
        statusMessage: "Requiere selección manual",
        gradesAnalysis: [],
      };
    });

    // 6. Consultar evaluaciones existentes y calificaciones del estudiante (SELECT únicamente)
    const linkedCaIds = comparisonSubjects
      .map((s) => s.cursoAsignaturaId)
      .filter((id): id is number => id !== null);

    let evaluaciones: RawEvaluation[] = [];
    let calificaciones: RawCalificacion[] = [];

    if (linkedCaIds.length > 0 && systemStudent?.id) {
      try {
        const { data: evData, error: evErr } = await supabase
          .from("evaluaciones")
          .select("id, curso_asignatura_id, nombre, orden, periodo")
          .in("curso_asignatura_id", linkedCaIds)
          .eq("periodo", 1)
          .order("orden", { ascending: true });

        if (!evErr && evData) {
          evaluaciones = evData as RawEvaluation[];
          const evalIds = evaluaciones.map((e) => e.id);

          if (evalIds.length > 0) {
            const { data: calData, error: calErr } = await supabase
              .from("calificaciones")
              .select("id, estudiante_id, evaluacion_id, nota")
              .eq("estudiante_id", systemStudent.id)
              .in("evaluacion_id", evalIds);

            if (!calErr && calData) {
              calificaciones = calData as RawCalificacion[];
            }
          }
        }
      } catch (err) {
        console.error("Error al consultar evaluaciones y notas existentes en Supabase:", err);
      }
    }

    // 7. Cruzar posiciones de notas del PDF con evaluaciones y calificaciones
    const gradesAnalysisResult = computeGradesAnalysis(
      comparisonSubjects,
      evaluaciones,
      calificaciones
    );

    // 8. Determinar Estado General del PDF
    const overallResult = computeOverallPdfStatus({
      studentMatchStatus,
      courseMatchStatus,
      subjects: gradesAnalysisResult.updatedSubjects,
      notasNuevasCount: gradesAnalysisResult.notasNuevasCount,
      notasDuplicadasCount: gradesAnalysisResult.notasDuplicadasCount,
      notasConflictosCount: gradesAnalysisResult.notasConflictosCount,
      evaluacionesFaltantesCount: gradesAnalysisResult.evaluacionesFaltantesCount,
      systemCourseName: systemCourse?.nombre,
      cursoPdf: parsed.curso,
    });

    return {
      fileName,
      fileSize,
      overallStatus: overallResult.overallStatus,
      statusMessage: overallResult.statusMessage,
      estudiantePdf: parsed.estudiante,
      runPdf: parsed.run,
      dvPdf: parsed.dv,
      rawRunPdf: parsed.rawRun,
      studentMatchStatus,
      systemStudent,
      cursoPdf: parsed.curso,
      cursoPdfNormalizado: parsed.cursoNormalizado,
      courseMatchStatus,
      systemCourse,
      subjects: gradesAnalysisResult.updatedSubjects,
      availableCourseSubjects,
      totalNotasPeriodo1: parsed.totalNotasPeriodo1,
      notasNuevasCount: gradesAnalysisResult.notasNuevasCount,
      notasDuplicadasCount: gradesAnalysisResult.notasDuplicadasCount,
      notasConflictosCount: gradesAnalysisResult.notasConflictosCount,
      evaluacionesFaltantesCount: gradesAnalysisResult.evaluacionesFaltantesCount,
    };
  };

  // Manejar selección de uno o varios archivos PDF
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const newReports: ValidatedPdfReport[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.toLowerCase().endsWith(".pdf")) continue;

      try {
        const buffer = await file.arrayBuffer();
        const validated = await validatePdfWithSupabase(buffer, file.name, file.size);
        newReports.push(validated);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Error al procesar archivo.";
        newReports.push({
          fileName: file.name,
          fileSize: file.size,
          overallStatus: "ERROR",
          statusMessage: errorMsg,
          estudiantePdf: "",
          runPdf: null,
          dvPdf: null,
          rawRunPdf: "",
          studentMatchStatus: "ERROR",
          systemStudent: null,
          cursoPdf: "",
          cursoPdfNormalizado: "",
          courseMatchStatus: "ERROR",
          systemCourse: null,
          subjects: [],
          availableCourseSubjects: [],
          totalNotasPeriodo1: 0,
          notasNuevasCount: 0,
          notasDuplicadasCount: 0,
          notasConflictosCount: 0,
          evaluacionesFaltantesCount: 0,
        });
      }
    }

    setReports((prev) => [...prev, ...newReports]);
    if (newReports.length > 0 && selectedReportIndex === null) {
      setSelectedReportIndex(0);
    }
    setIsProcessing(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Asignar manualmente una asignatura del sistema a una asignatura del PDF
  const handleManualSubjectChange = async (subjectIndex: number, newCursoAsignaturaIdStr: string) => {
    if (selectedReportIndex === null || !reports[selectedReportIndex]) return;

    const report = reports[selectedReportIndex];
    const newCaId = newCursoAsignaturaIdStr ? parseInt(newCursoAsignaturaIdStr, 10) : null;
    const selectedCourseSubject = report.availableCourseSubjects.find((cs) => cs.id === newCaId);

    const updatedSubjects = [...report.subjects];
    const currentItem = updatedSubjects[subjectIndex];

    if (newCaId && selectedCourseSubject) {
      updatedSubjects[subjectIndex] = {
        ...currentItem,
        cursoAsignaturaId: newCaId,
        asignaturaSistemaId: selectedCourseSubject.asignatura_id,
        asignaturaSistemaNombre: selectedCourseSubject.asignaturas.nombre,
        status: "VINCULADA",
        statusMessage: "Vinculación manual UTP",
        gradesAnalysis: [],
      };
    } else {
      updatedSubjects[subjectIndex] = {
        ...currentItem,
        cursoAsignaturaId: null,
        asignaturaSistemaId: null,
        asignaturaSistemaNombre: null,
        status: "MANUAL",
        statusMessage: "Requiere selección manual",
        gradesAnalysis: [],
      };
    }

    // Consultar evaluaciones y notas para todas las asignaturas vinculadas actualizadas
    const linkedCaIds = updatedSubjects
      .map((s) => s.cursoAsignaturaId)
      .filter((id): id is number => id !== null);

    let evaluaciones: RawEvaluation[] = [];
    let calificaciones: RawCalificacion[] = [];

    if (linkedCaIds.length > 0 && report.systemStudent?.id) {
      try {
        const { data: evData, error: evErr } = await supabase
          .from("evaluaciones")
          .select("id, curso_asignatura_id, nombre, orden, periodo")
          .in("curso_asignatura_id", linkedCaIds)
          .eq("periodo", 1)
          .order("orden", { ascending: true });

        if (!evErr && evData) {
          evaluaciones = evData as RawEvaluation[];
          const evalIds = evaluaciones.map((e) => e.id);

          if (evalIds.length > 0) {
            const { data: calData, error: calErr } = await supabase
              .from("calificaciones")
              .select("id, estudiante_id, evaluacion_id, nota")
              .eq("estudiante_id", report.systemStudent.id)
              .in("evaluacion_id", evalIds);

            if (!calErr && calData) {
              calificaciones = calData as RawCalificacion[];
            }
          }
        }
      } catch (err) {
        console.error("Error al actualizar análisis tras vinculación manual:", err);
      }
    }

    const gradesAnalysisResult = computeGradesAnalysis(
      updatedSubjects,
      evaluaciones,
      calificaciones
    );

    const overallResult = computeOverallPdfStatus({
      studentMatchStatus: report.studentMatchStatus,
      courseMatchStatus: report.courseMatchStatus,
      subjects: gradesAnalysisResult.updatedSubjects,
      notasNuevasCount: gradesAnalysisResult.notasNuevasCount,
      notasDuplicadasCount: gradesAnalysisResult.notasDuplicadasCount,
      notasConflictosCount: gradesAnalysisResult.notasConflictosCount,
      evaluacionesFaltantesCount: gradesAnalysisResult.evaluacionesFaltantesCount,
      systemCourseName: report.systemCourse?.nombre,
      cursoPdf: report.cursoPdf,
    });

    const updatedReport: ValidatedPdfReport = {
      ...report,
      subjects: gradesAnalysisResult.updatedSubjects,
      overallStatus: overallResult.overallStatus,
      statusMessage: overallResult.statusMessage,
      notasNuevasCount: gradesAnalysisResult.notasNuevasCount,
      notasDuplicadasCount: gradesAnalysisResult.notasDuplicadasCount,
      notasConflictosCount: gradesAnalysisResult.notasConflictosCount,
      evaluacionesFaltantesCount: gradesAnalysisResult.evaluacionesFaltantesCount,
    };

    const newReportsList = [...reports];
    newReportsList[selectedReportIndex] = updatedReport;
    setReports(newReportsList);
  };

  const handleClearReports = () => {
    setReports([]);
    setSelectedReportIndex(null);
    setExpandedSubjects({});
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 border-r-transparent"></div>
          <p className="mt-3 text-sm font-medium text-zinc-600">Verificando credenciales institucionales...</p>
        </div>
      </div>
    );
  }

  if (!isUtp) {
    return (
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar
          currentSection="cursos"
          onSelectSection={() => {}}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />
        <div className="flex-1 lg:pl-64">
          <Header
            institution={institution}
            onOpenMobileSidebar={() => setIsMobileMenuOpen(true)}
          />
          <main className="p-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm">
              <h2 className="text-lg font-semibold">Acceso Exclusivo para Unidad Técnico Pedagógica</h2>
              <p className="mt-2 text-sm text-amber-800">
                Esta herramienta administrativa de previsualización e importación histórica de notas está
                reservada únicamente para usuarios con perfil UTP.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const selectedReport =
    selectedReportIndex !== null && reports[selectedReportIndex] ? reports[selectedReportIndex] : null;

  const totalNotasGlobal = reports.reduce((acc, r) => acc + r.totalNotasPeriodo1, 0);
  const totalListos = reports.filter((r) => r.overallStatus === "LISTO_PARA_IMPORTAR").length;
  const totalRevisar = reports.filter((r) => r.overallStatus === "REVISAR").length;
  const totalDuplicados = reports.filter((r) => r.overallStatus === "DUPLICADO").length;
  const totalErrores = reports.filter((r) => r.overallStatus === "ERROR" || r.overallStatus === "PDF_SIN_TEXTO").length;

  // Helper para badge de estado de nota
  const renderGradeStatusBadge = (status: GradePositionStatus) => {
    switch (status) {
      case "NUEVA":
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            NUEVA
          </span>
        );
      case "DUPLICADO":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
            DUPLICADO
          </span>
        );
      case "CONFLICTO":
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
            CONFLICTO
          </span>
        );
      case "EVALUACION_FALTANTE":
        return (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            EVALUACIÓN FALTANTE
          </span>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans">
      <Sidebar
        currentSection={currentSection}
        onSelectSection={() => {}}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 lg:pl-64">
        <Header
          institution={institution}
          onOpenMobileSidebar={() => setIsMobileMenuOpen(true)}
        />

        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {/* Encabezado y aviso de etapa */}
          <div className="mb-6 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 border border-blue-200">
                  <span>Etapa 19D — Detección de Evaluaciones y Notas Existentes (Solo Lectura)</span>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
                  Detección de Evaluaciones y Comparación de Calificaciones
                </h1>
                <p className="mt-1 text-sm text-zinc-600">
                  Compara cada nota numérica del Periodo 1 con las evaluaciones y notas registradas en Supabase.
                  Determina notas nuevas, duplicadas, conflictos y evaluaciones faltantes sin modificar la base de datos.
                </p>
              </div>

              {reports.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearReports}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
                >
                  Limpiar lista
                </button>
              )}
            </div>

            {/* Zona de Carga / Drag & Drop */}
            <div className="mt-6">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,application/pdf"
                onChange={handleFilesSelected}
                className="hidden"
                id="pdf-upload-input"
              />
              <label
                htmlFor="pdf-upload-input"
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center transition cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 ${
                  isProcessing ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                <div className="rounded-full bg-blue-100 p-3 text-blue-700">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-semibold text-zinc-800">
                  {isProcessing ? "Procesando y consultando Supabase..." : "Seleccionar o arrastrar informes PDF aquí"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Consultas SELECT con usuario autenticado UTP. No se ejecutan inserciones ni modificaciones.
                </p>
              </label>
            </div>
          </div>

          {/* Tarjetas de Resumen Global */}
          {reports.length > 0 && (
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Total Informes
                </span>
                <p className="mt-2 text-2xl font-bold text-zinc-900">{reports.length}</p>
                <p className="mt-1 text-xs text-zinc-500">{totalNotasGlobal} notas P1 detectadas</p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Listos para Importar
                </span>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{totalListos}</p>
                <p className="mt-1 text-xs text-emerald-600">Sin conflictos detectados</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Revisar
                </span>
                <p className="mt-2 text-2xl font-bold text-amber-700">{totalRevisar}</p>
                <p className="mt-1 text-xs text-amber-600">Conflictos, cursos o asignaturas pendientes</p>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                  Duplicados
                </span>
                <p className="mt-2 text-2xl font-bold text-blue-700">{totalDuplicados}</p>
                <p className="mt-1 text-xs text-blue-600">Todas las notas ya registradas</p>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-red-700">
                  Errores
                </span>
                <p className="mt-2 text-2xl font-bold text-red-700">{totalErrores}</p>
                <p className="mt-1 text-xs text-red-600">Estudiante inexistente o PDF inválido</p>
              </div>
            </div>
          )}

          {/* Lista de Informes y Detalle de Cruce */}
          {reports.length > 0 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Columna Izquierda: Listado de archivos procesados */}
              <div className="lg:col-span-4">
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <div className="border-b border-zinc-200 bg-zinc-50/70 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-800">
                      Informes Analizados ({reports.length})
                    </h2>
                  </div>
                  <div className="max-h-[660px] divide-y divide-zinc-100 overflow-y-auto">
                    {reports.map((rep, idx) => {
                      const isSelected = selectedReportIndex === idx;
                      return (
                        <button
                          key={`${rep.fileName}-${idx}`}
                          type="button"
                          onClick={() => setSelectedReportIndex(idx)}
                          className={`w-full text-left p-3.5 transition flex flex-col gap-1.5 ${
                            isSelected
                              ? "bg-blue-50/60 border-l-4 border-blue-600"
                              : "hover:bg-zinc-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-zinc-900" title={rep.fileName}>
                              {rep.fileName}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                rep.overallStatus === "LISTO_PARA_IMPORTAR"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : rep.overallStatus === "DUPLICADO"
                                  ? "bg-blue-100 text-blue-800"
                                  : rep.overallStatus === "REVISAR"
                                  ? "bg-amber-100 text-amber-800"
                                  : rep.overallStatus === "PDF_SIN_TEXTO"
                                  ? "bg-zinc-200 text-zinc-700"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {rep.overallStatus === "LISTO_PARA_IMPORTAR"
                                ? "LISTO"
                                : rep.overallStatus}
                            </span>
                          </div>

                          <div className="text-xs text-zinc-600">
                            <p className="font-medium text-zinc-900 truncate">
                              {rep.systemStudent
                                ? `${rep.systemStudent.nombres} ${rep.systemStudent.apellidos}`
                                : rep.estudiantePdf || "No identificado"}
                            </p>
                            <p className="text-[11px] text-zinc-500 font-mono">
                              RUN: {rep.rawRunPdf || "Sin RUN"}
                            </p>
                          </div>

                          {/* Mini resumen de notas por estudiante */}
                          <div className="mt-1 flex flex-wrap gap-1 text-[10px] border-t border-zinc-100 pt-1.5 font-medium">
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 border border-emerald-100">
                              Nuevas: {rep.notasNuevasCount}
                            </span>
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 border border-blue-100">
                              Duplicadas: {rep.notasDuplicadasCount}
                            </span>
                            {rep.notasConflictosCount > 0 && (
                              <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 border border-red-200 font-bold">
                                Conflictos: {rep.notasConflictosCount}
                              </span>
                            )}
                            {rep.evaluacionesFaltantesCount > 0 && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 border border-amber-200">
                                Faltantes: {rep.evaluacionesFaltantesCount}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Vista Previa y Cruce Detallado */}
              <div className="lg:col-span-8">
                {selectedReport ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                    {/* Tarjeta de Encabezado de Validación */}
                    <div className="border-b border-zinc-200 pb-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                            Resultado de Detección de Evaluaciones y Calificaciones
                          </span>
                          <h3 className="mt-1 text-xl font-bold text-zinc-900">
                            {selectedReport.systemStudent
                              ? `${selectedReport.systemStudent.nombres} ${selectedReport.systemStudent.apellidos}`
                              : selectedReport.estudiantePdf || "Estudiante no identificado"}
                          </h3>
                        </div>

                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                            selectedReport.overallStatus === "LISTO_PARA_IMPORTAR"
                              ? "bg-emerald-100 text-emerald-800"
                              : selectedReport.overallStatus === "DUPLICADO"
                              ? "bg-blue-100 text-blue-800"
                              : selectedReport.overallStatus === "REVISAR"
                              ? "bg-amber-100 text-amber-800"
                              : selectedReport.overallStatus === "PDF_SIN_TEXTO"
                              ? "bg-zinc-200 text-zinc-700"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {selectedReport.overallStatus.replace(/_/g, " ")}
                        </span>
                      </div>

                      <p className="mt-2 text-xs font-medium text-zinc-600">
                        {selectedReport.statusMessage}
                      </p>

                      {/* Cuadrícula Comparativa Estudiante & Curso */}
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl bg-zinc-50 p-4 border border-zinc-200 text-xs">
                        {/* Estudiante */}
                        <div className="rounded-lg bg-white p-3 border border-zinc-200/70">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-zinc-700">Validación de Estudiante</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                selectedReport.studentMatchStatus === "ENCONTRADO"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {selectedReport.studentMatchStatus}
                            </span>
                          </div>
                          <p className="text-zinc-600">
                            <span className="text-zinc-400">PDF:</span> {selectedReport.estudiantePdf || "—"}
                          </p>
                          <p className="text-zinc-900 font-semibold mt-0.5">
                            <span className="text-zinc-400 font-normal">Sistema:</span>{" "}
                            {selectedReport.systemStudent
                              ? `${selectedReport.systemStudent.nombres} ${selectedReport.systemStudent.apellidos}`
                              : "No encontrado en Supabase"}
                          </p>
                          <p className="text-zinc-500 font-mono mt-1 text-[11px]">
                            RUN: {selectedReport.rawRunPdf || "No informado"}
                          </p>
                        </div>

                        {/* Curso */}
                        <div className="rounded-lg bg-white p-3 border border-zinc-200/70">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-zinc-700">Validación de Curso</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                selectedReport.courseMatchStatus === "COINCIDE"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {selectedReport.courseMatchStatus}
                            </span>
                          </div>
                          <p className="text-zinc-600">
                            <span className="text-zinc-400">PDF:</span> {selectedReport.cursoPdf || "—"}
                          </p>
                          <p className="text-zinc-900 font-semibold mt-0.5">
                            <span className="text-zinc-400 font-normal">Sistema:</span>{" "}
                            {selectedReport.systemCourse ? selectedReport.systemCourse.nombre : "Sin curso vinculado"}
                          </p>
                          <p className="text-zinc-500 mt-1 text-[11px]">
                            {selectedReport.courseMatchStatus === "COINCIDE"
                              ? "Correspondencia de nivel y letra verificada."
                              : "El curso del PDF difiere del curso matriculado en el sistema."}
                          </p>
                        </div>
                      </div>

                      {/* Resumen de Notas y Evaluaciones por Estudiante (Requisito 8) */}
                      <div className="mt-4">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                          Resumen de Calificaciones y Evaluaciones del Estudiante
                        </span>
                        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {/* Notas Nuevas */}
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                            <span className="text-[11px] font-bold text-emerald-800 uppercase">
                              Notas Nuevas
                            </span>
                            <p className="mt-1 text-xl font-extrabold text-emerald-700">
                              {selectedReport.notasNuevasCount}
                            </p>
                            <p className="mt-0.5 text-[10px] text-emerald-600">
                              No existe calificación y puede importarse
                            </p>
                          </div>

                          {/* Notas Duplicadas */}
                          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                            <span className="text-[11px] font-bold text-blue-800 uppercase">
                              Duplicadas
                            </span>
                            <p className="mt-1 text-xl font-extrabold text-blue-700">
                              {selectedReport.notasDuplicadasCount}
                            </p>
                            <p className="mt-0.5 text-[10px] text-blue-600">
                              Existe calificación con exactamente el mismo valor
                            </p>
                          </div>

                          {/* Conflictos */}
                          <div className={`rounded-xl border p-3 ${
                            selectedReport.notasConflictosCount > 0
                              ? "border-red-300 bg-red-50/80"
                              : "border-zinc-200 bg-zinc-50/50"
                          }`}>
                            <span className={`text-[11px] font-bold uppercase ${
                              selectedReport.notasConflictosCount > 0 ? "text-red-800" : "text-zinc-600"
                            }`}>
                              Conflictos
                            </span>
                            <p className={`mt-1 text-xl font-extrabold ${
                              selectedReport.notasConflictosCount > 0 ? "text-red-700" : "text-zinc-700"
                            }`}>
                              {selectedReport.notasConflictosCount}
                            </p>
                            <p className={`mt-0.5 text-[10px] ${
                              selectedReport.notasConflictosCount > 0 ? "text-red-600" : "text-zinc-500"
                            }`}>
                              Existe calificación pero con valor diferente
                            </p>
                          </div>

                          {/* Evaluaciones Faltantes */}
                          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                            <span className="text-[11px] font-bold text-amber-800 uppercase">
                              Eval. Faltantes
                            </span>
                            <p className="mt-1 text-xl font-extrabold text-amber-700">
                              {selectedReport.evaluacionesFaltantesCount}
                            </p>
                            <p className="mt-0.5 text-[10px] text-amber-600">
                              Orden sin evaluación (se creará histórica al importar)
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tabla de Asignaturas y Detección por Posición */}
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-zinc-900">
                          Detalle por Asignatura y Evaluaciones ({selectedReport.subjects.length})
                        </h4>
                        <span className="text-xs text-zinc-500">
                          Total notas P1:{" "}
                          <strong className="text-emerald-700">{selectedReport.totalNotasPeriodo1}</strong>
                        </span>
                      </div>

                      {selectedReport.subjects.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-xs text-zinc-500">
                          No se identificaron asignaturas en este archivo.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedReport.subjects.map((sub, sIdx) => {
                            const subKey = `${selectedReport.fileName}-${sub.asignaturaPdf}-${sIdx}`;
                            const isExpanded = expandedSubjects[subKey] ?? true; // abiertas por defecto para inspección clara

                            return (
                              <div
                                key={subKey}
                                className={`rounded-xl border transition ${
                                  sub.isConceptual
                                    ? "border-zinc-200 bg-zinc-50/40"
                                    : sub.gradesAnalysis.some((g) => g.status === "CONFLICTO")
                                    ? "border-red-300 bg-red-50/10"
                                    : sub.status === "MANUAL"
                                    ? "border-amber-300 bg-amber-50/20"
                                    : "border-zinc-200 bg-white"
                                }`}
                              >
                                {/* Fila Principal de la Asignatura */}
                                <div className="p-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h5 className="text-xs font-bold text-zinc-900">
                                        {sub.asignaturaPdf}
                                      </h5>
                                      {sub.isConceptual && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                          Conceptual
                                        </span>
                                      )}
                                      {!sub.isConceptual && sub.status === "VINCULADA" && (
                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                          Vinculada
                                        </span>
                                      )}
                                      {!sub.isConceptual && sub.status === "MANUAL" && (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                          Manual
                                        </span>
                                      )}
                                    </div>

                                    {/* Selector o nombre de asignatura del sistema */}
                                    <div className="mt-2 max-w-sm">
                                      {!sub.isConceptual && selectedReport.availableCourseSubjects.length > 0 ? (
                                        <select
                                          value={sub.cursoAsignaturaId ?? ""}
                                          onChange={(e) => handleManualSubjectChange(sIdx, e.target.value)}
                                          className={`w-full rounded-md border text-xs py-1 px-2 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none ${
                                            sub.status === "VINCULADA"
                                              ? "border-emerald-300 bg-emerald-50/30 text-emerald-950 font-semibold"
                                              : "border-amber-300 bg-amber-50/50 text-amber-950"
                                          }`}
                                        >
                                          <option value="">-- Seleccionar asignatura --</option>
                                          {selectedReport.availableCourseSubjects.map((cs) => (
                                            <option key={cs.id} value={cs.id}>
                                              {cs.asignaturas.nombre} (ID {cs.id})
                                            </option>
                                          ))}
                                        </select>
                                      ) : sub.isConceptual ? (
                                        <span className="text-[11px] text-zinc-400 italic">
                                          Asignatura conceptual omitida del cálculo de notas
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-zinc-400 italic">
                                          Sin asignaturas disponibles en curso
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Resumen de Notas y Promedio */}
                                  <div className="flex flex-wrap items-center gap-3 text-xs">
                                    <div>
                                      <span className="text-[10px] text-zinc-400 block">Notas PDF P1:</span>
                                      <div className="flex flex-wrap gap-1 mt-0.5">
                                        {sub.notasPeriodo1.length > 0 ? (
                                          sub.notasPeriodo1.map((n, nIdx) => (
                                            <span
                                              key={nIdx}
                                              className="inline-flex items-center rounded bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 font-mono text-[11px] font-bold text-zinc-800"
                                            >
                                              {n.toFixed(1).replace(".", ",")}
                                            </span>
                                          ))
                                        ) : sub.isConceptual ? (
                                          sub.conceptualNotas?.map((c, cIdx) => (
                                            <span
                                              key={cIdx}
                                              className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600"
                                            >
                                              {c}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-zinc-400 italic text-[11px]">Sin notas</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Promedio PDF (solo validación) */}
                                    <div className="text-right min-w-[70px] border-l border-zinc-200 pl-3">
                                      <span className="text-[10px] text-zinc-400 block" title="Dato exclusivo de validación">
                                        Promedio PDF
                                      </span>
                                      <span className="font-mono font-bold text-zinc-700 text-xs">
                                        {sub.promedioInformado !== null
                                          ? sub.promedioInformado.toFixed(1).replace(".", ",")
                                          : "—"}
                                      </span>
                                    </div>

                                    {/* Botón para colapsar/expandir desglose */}
                                    {sub.gradesAnalysis.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSubjectExpansion(subKey)}
                                        className="ml-2 inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                                      >
                                        <span>{isExpanded ? "Ocultar" : "Ver"} desglose</span>
                                        <svg
                                          className={`h-3 w-3 transform transition-transform ${
                                            isExpanded ? "rotate-180" : ""
                                          }`}
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Desglose detallado por Posición (Requisitos 3, 4, 5, 6) */}
                                {sub.gradesAnalysis.length > 0 && isExpanded && (
                                  <div className="border-t border-zinc-100 bg-zinc-50/70 p-3">
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-xs">
                                        <thead>
                                          <tr className="border-b border-zinc-200 text-[10px] font-bold uppercase text-zinc-500">
                                            <th className="pb-1.5 pl-1">Posición PDF</th>
                                            <th className="pb-1.5">Nota PDF</th>
                                            <th className="pb-1.5">Evaluación Supabase</th>
                                            <th className="pb-1.5 text-center">Orden</th>
                                            <th className="pb-1.5 text-center">Calificación Sistema</th>
                                            <th className="pb-1.5">Estado</th>
                                            <th className="pb-1.5">Detalle</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-200/50">
                                          {sub.gradesAnalysis.map((gItem) => (
                                            <tr
                                              key={gItem.posicion}
                                              className={
                                                gItem.status === "CONFLICTO"
                                                  ? "bg-red-50/40"
                                                  : gItem.status === "DUPLICADO"
                                                  ? "bg-blue-50/20"
                                                  : gItem.status === "NUEVA"
                                                  ? "bg-emerald-50/20"
                                                  : "bg-amber-50/20"
                                              }
                                            >
                                              {/* Posición PDF */}
                                              <td className="py-2 pl-1 font-semibold text-zinc-800">
                                                Nota {gItem.posicion}
                                              </td>

                                              {/* Nota PDF */}
                                              <td className="py-2 font-mono font-bold text-zinc-900">
                                                {gItem.notaPdf.toFixed(1).replace(".", ",")}
                                              </td>

                                              {/* Evaluación Existente */}
                                              <td className="py-2 text-zinc-700">
                                                {gItem.evaluacionExistenteNombre ? (
                                                  <span className="font-medium text-zinc-900">
                                                    {gItem.evaluacionExistenteNombre}
                                                  </span>
                                                ) : (
                                                  <span className="text-zinc-400 italic">
                                                    — Sin evaluación —
                                                  </span>
                                                )}
                                              </td>

                                              {/* Orden */}
                                              <td className="py-2 text-center font-mono font-medium text-zinc-600">
                                                orden {gItem.orden}
                                              </td>

                                              {/* Calificación Existente */}
                                              <td className="py-2 text-center font-mono font-semibold">
                                                {gItem.calificacionExistenteValor !== null ? (
                                                  <span
                                                    className={
                                                      gItem.status === "CONFLICTO"
                                                        ? "text-red-700 font-bold"
                                                        : "text-zinc-800"
                                                    }
                                                  >
                                                    {gItem.calificacionExistenteValor.toFixed(1).replace(".", ",")}
                                                  </span>
                                                ) : (
                                                  <span className="text-zinc-400 font-normal italic">—</span>
                                                )}
                                              </td>

                                              {/* Estado */}
                                              <td className="py-2">
                                                {renderGradeStatusBadge(gItem.status)}
                                              </td>

                                              {/* Detalle */}
                                              <td className="py-2 text-[11px] text-zinc-500">
                                                {gItem.statusMessage}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Botón de Importación (Requisito 10) */}
                    <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs text-zinc-600">
                        <p className="font-semibold text-zinc-900">Estado de Importación Histórica:</p>
                        <p className="mt-0.5">
                          {selectedReport.overallStatus === "LISTO_PARA_IMPORTAR"
                            ? "El estudiante, curso y asignaturas están 100% verificados sin conflictos. Listo para importar en la siguiente etapa."
                            : selectedReport.overallStatus === "DUPLICADO"
                            ? "Todas las notas del informe ya existen en el sistema con valores idénticos."
                            : selectedReport.overallStatus === "REVISAR"
                            ? "Existen observaciones, asignaturas pendientes o conflictos de notas que deben atenderse antes de importar."
                            : "El informe presenta errores estructurales que impiden su procesamiento."}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-300 px-5 py-2.5 text-xs font-bold text-zinc-600 shadow-none cursor-not-allowed opacity-80 shrink-0"
                        title="Importación no disponible en esta etapa"
                      >
                        <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        Importación disponible en siguiente etapa
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
                    Seleccione un informe de la lista para ver su cruce con Supabase.
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
