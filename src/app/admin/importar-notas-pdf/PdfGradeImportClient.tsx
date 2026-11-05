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
  PeriodSummary,
} from "@/utils/pdfCrossValidation";

interface PdfGradeImportClientProps {
  institution: InstitutionalInfo;
}

interface ImportRpcResult {
  insertadas: number;
  duplicadas: number;
  conflictos: number;
  evaluaciones_creadas: number;
  errores: Array<{
    estudiante_id?: string;
    curso_asignatura_id?: string;
    periodo?: number;
    orden?: string;
    nota?: string;
    error: string;
  }>;
}

const emptyPeriodSummary: PeriodSummary = {
  nuevasCount: 0,
  duplicadasCount: 0,
  conflictosCount: 0,
  evaluacionesFaltantesCount: 0,
  totalNotas: 0,
};

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

  // Estados de la importación (Etapa 19F)
  const [importP1, setImportP1] = useState(true);
  const [importP2, setImportP2] = useState(true);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportRpcResult | null>(null);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);

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
    // 1. Extraer datos con el parser de PDF (Periodo 1 y Periodo 2)
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
        totalNotasPeriodo2: 0,
        notasNuevasCount: 0,
        notasDuplicadasCount: 0,
        notasConflictosCount: 0,
        evaluacionesFaltantesCount: 0,
        p1Summary: { ...emptyPeriodSummary },
        p2Summary: { ...emptyPeriodSummary },
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
        totalNotasPeriodo2: 0,
        notasNuevasCount: 0,
        notasDuplicadasCount: 0,
        notasConflictosCount: 0,
        evaluacionesFaltantesCount: 0,
        p1Summary: { ...emptyPeriodSummary },
        p2Summary: { ...emptyPeriodSummary },
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
          notasPeriodo2: asig.notasPeriodo2,
          promedioP1: asig.promedioP1,
          promedioP2: asig.promedioP2,
          promedioFinal: asig.promedioFinal,
          promedioInformado: asig.promedioInformado,
          isConceptual: true,
          conceptualNotas: asig.conceptualNotas,
          cursoAsignaturaId: null,
          asignaturaSistemaId: null,
          asignaturaSistemaNombre: null,
          status: "CONCEPTUAL_OMITIDA",
          statusMessage: "Conceptual — omitida en esta etapa",
          gradesAnalysisP1: [],
          gradesAnalysisP2: [],
          gradesAnalysis: [],
        };
      }

      // Si no tenemos asignaturas del curso, queda pendiente
      if (availableCourseSubjects.length === 0) {
        return {
          asignaturaPdf: asig.asignatura,
          notasPeriodo1: asig.notasPeriodo1,
          notasPeriodo2: asig.notasPeriodo2,
          promedioP1: asig.promedioP1,
          promedioP2: asig.promedioP2,
          promedioFinal: asig.promedioFinal,
          promedioInformado: asig.promedioInformado,
          isConceptual: false,
          cursoAsignaturaId: null,
          asignaturaSistemaId: null,
          asignaturaSistemaNombre: null,
          status: "MANUAL",
          statusMessage: "Curso sin asignaturas asociadas o estudiante no vinculado",
          gradesAnalysisP1: [],
          gradesAnalysisP2: [],
          gradesAnalysis: [],
        };
      }

      const match = matchSubjectToCourse(asig.asignatura, availableCourseSubjects);

      if (match.isExact && match.matchedSubject) {
        return {
          asignaturaPdf: asig.asignatura,
          notasPeriodo1: asig.notasPeriodo1,
          notasPeriodo2: asig.notasPeriodo2,
          promedioP1: asig.promedioP1,
          promedioP2: asig.promedioP2,
          promedioFinal: asig.promedioFinal,
          promedioInformado: asig.promedioInformado,
          isConceptual: false,
          cursoAsignaturaId: match.matchedSubject.id,
          asignaturaSistemaId: match.matchedSubject.asignatura_id,
          asignaturaSistemaNombre: match.matchedSubject.asignaturas.nombre,
          status: "VINCULADA",
          statusMessage: "Vinculación exacta",
          gradesAnalysisP1: [],
          gradesAnalysisP2: [],
          gradesAnalysis: [],
        };
      }

      if (match.isSuggested && match.matchedSubject) {
        return {
          asignaturaPdf: asig.asignatura,
          notasPeriodo1: asig.notasPeriodo1,
          notasPeriodo2: asig.notasPeriodo2,
          promedioP1: asig.promedioP1,
          promedioP2: asig.promedioP2,
          promedioFinal: asig.promedioFinal,
          promedioInformado: asig.promedioInformado,
          isConceptual: false,
          cursoAsignaturaId: match.matchedSubject.id,
          asignaturaSistemaId: match.matchedSubject.asignatura_id,
          asignaturaSistemaNombre: match.matchedSubject.asignaturas.nombre,
          status: "VINCULADA",
          statusMessage: `Sugerida por alias (${match.matchedSubject.asignaturas.nombre})`,
          sugerenciaId: match.matchedSubject.id,
          gradesAnalysisP1: [],
          gradesAnalysisP2: [],
          gradesAnalysis: [],
        };
      }

      return {
        asignaturaPdf: asig.asignatura,
        notasPeriodo1: asig.notasPeriodo1,
        notasPeriodo2: asig.notasPeriodo2,
        promedioP1: asig.promedioP1,
        promedioP2: asig.promedioP2,
        promedioFinal: asig.promedioFinal,
        promedioInformado: asig.promedioInformado,
        isConceptual: false,
        cursoAsignaturaId: null,
        asignaturaSistemaId: null,
        asignaturaSistemaNombre: null,
        status: "MANUAL",
        statusMessage: "Requiere selección manual",
        gradesAnalysisP1: [],
        gradesAnalysisP2: [],
        gradesAnalysis: [],
      };
    });

    // 6. Consultar evaluaciones existentes (periodos 1 y 2) y calificaciones del estudiante
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
          .in("periodo", [1, 2])
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

    // 7. Cruzar posiciones de notas del PDF con evaluaciones y calificaciones para P1 y P2
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
      totalNotasPeriodo2: parsed.totalNotasPeriodo2,
      notasNuevasCount: gradesAnalysisResult.notasNuevasCount,
      notasDuplicadasCount: gradesAnalysisResult.notasDuplicadasCount,
      notasConflictosCount: gradesAnalysisResult.notasConflictosCount,
      evaluacionesFaltantesCount: gradesAnalysisResult.evaluacionesFaltantesCount,
      p1Summary: gradesAnalysisResult.p1Summary,
      p2Summary: gradesAnalysisResult.p2Summary,
    };
  };

  // Re-evaluar calificaciones existentes tras una importación o modificación
  const refreshReportValidation = async (reportIndex: number) => {
    const report = reports[reportIndex];
    if (!report || !report.systemStudent) return;

    const linkedCaIds = report.subjects
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
          .in("periodo", [1, 2])
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
        console.error("Error al refrescar evaluaciones y notas:", err);
      }
    }

    const gradesAnalysisResult = computeGradesAnalysis(
      report.subjects,
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
      p1Summary: gradesAnalysisResult.p1Summary,
      p2Summary: gradesAnalysisResult.p2Summary,
    };

    setReports((prev) => {
      const copy = [...prev];
      copy[reportIndex] = updatedReport;
      return copy;
    });
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
          totalNotasPeriodo2: 0,
          notasNuevasCount: 0,
          notasDuplicadasCount: 0,
          notasConflictosCount: 0,
          evaluacionesFaltantesCount: 0,
          p1Summary: { ...emptyPeriodSummary },
          p2Summary: { ...emptyPeriodSummary },
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
        gradesAnalysisP1: [],
        gradesAnalysisP2: [],
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
        gradesAnalysisP1: [],
        gradesAnalysisP2: [],
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
          .in("periodo", [1, 2])
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
      p1Summary: gradesAnalysisResult.p1Summary,
      p2Summary: gradesAnalysisResult.p2Summary,
    };

    const newReportsList = [...reports];
    newReportsList[selectedReportIndex] = updatedReport;
    setReports(newReportsList);
  };

  // Ejecutar importación real en Supabase (Etapa 19F)
  const handleExecuteImport = async () => {
    if (selectedReportIndex === null || !reports[selectedReportIndex]) return;
    const report = reports[selectedReportIndex];

    if (!report.systemStudent || report.overallStatus !== "LISTO_PARA_IMPORTAR") {
      return;
    }

    if (!importP1 && !importP2) {
      setImportErrorMessage("Debe seleccionar al menos un semestre a importar (1° Semestre o 2° Semestre).");
      return;
    }

    setIsImporting(true);
    setImportErrorMessage(null);

    // Preparar el lote de notas validadas según semestres seleccionados
    const notasLote: Array<{
      estudiante_id: number;
      curso_asignatura_id: number;
      periodo: number;
      orden: number;
      nota: number;
      nombre_evaluacion: string;
    }> = [];

    report.subjects.forEach((sub) => {
      if (!sub.isConceptual && sub.cursoAsignaturaId) {
        // Notas del Periodo 1
        if (importP1 && sub.notasPeriodo1.length > 0) {
          sub.notasPeriodo1.forEach((gradeVal, idx) => {
            notasLote.push({
              estudiante_id: report.systemStudent!.id,
              curso_asignatura_id: sub.cursoAsignaturaId!,
              periodo: 1,
              orden: idx + 1,
              nota: Number(gradeVal.toFixed(1)),
              nombre_evaluacion: `Nota histórica ${idx + 1}`,
            });
          });
        }
        // Notas del Periodo 2
        if (importP2 && sub.notasPeriodo2.length > 0) {
          sub.notasPeriodo2.forEach((gradeVal, idx) => {
            notasLote.push({
              estudiante_id: report.systemStudent!.id,
              curso_asignatura_id: sub.cursoAsignaturaId!,
              periodo: 2,
              orden: idx + 1,
              nota: Number(gradeVal.toFixed(1)),
              nombre_evaluacion: `Nota histórica ${idx + 1}`,
            });
          });
        }
      }
    });

    if (notasLote.length === 0) {
      setImportErrorMessage("No hay notas numéricas para importar en los semestres seleccionados.");
      setIsImporting(false);
      return;
    }

    try {
      // Invocación a la función RPC con el cliente autenticado UTP
      const { data, error } = await supabase.rpc("importar_notas_historicas_pdf", {
        p_notas: { notas: notasLote },
      });

      if (error) {
        const isRpcMissing =
          error.message.includes("importar_notas_historicas_pdf") ||
          error.code === "PGRST202" ||
          error.code === "42883";

        const detailedMsg = isRpcMissing
          ? "La función RPC 'importar_notas_historicas_pdf' aún no ha sido creada o actualizada en Supabase. Por favor ejecute el script SQL generado en 'supabase/importar_notas_historicas_pdf.sql' a través del SQL Editor de Supabase."
          : `Error devuelto por Supabase: ${error.message}`;

        setImportErrorMessage(detailedMsg);
        setIsImporting(false);
        return;
      }

      const res = data as ImportRpcResult;
      setImportResult(res);
      setIsConfirmModalOpen(false);
      setIsResultModalOpen(true);

      // Refrescar validación inmediatamente contra la base de datos
      await refreshReportValidation(selectedReportIndex);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido durante la importación.";
      setImportErrorMessage(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearReports = () => {
    setReports([]);
    setSelectedReportIndex(null);
    setExpandedSubjects({});
    setImportResult(null);
    setImportErrorMessage(null);
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

  const totalNotasP1Global = reports.reduce((acc, r) => acc + r.totalNotasPeriodo1, 0);
  const totalNotasP2Global = reports.reduce((acc, r) => acc + r.totalNotasPeriodo2, 0);
  const totalNotasGlobal = totalNotasP1Global + totalNotasP2Global;
  const totalListos = reports.filter((r) => r.overallStatus === "LISTO_PARA_IMPORTAR").length;
  const totalRevisar = reports.filter((r) => r.overallStatus === "REVISAR").length;
  const totalDuplicados = reports.filter((r) => r.overallStatus === "DUPLICADO").length;
  const totalErrores = reports.filter((r) => r.overallStatus === "ERROR" || r.overallStatus === "PDF_SIN_TEXTO").length;

  // Conteo de notas por semestre para el reporte seleccionado
  const notasP1Count = selectedReport
    ? selectedReport.subjects
        .filter((s) => !s.isConceptual && s.cursoAsignaturaId)
        .reduce((acc, s) => acc + s.notasPeriodo1.length, 0)
    : 0;

  const notasP2Count = selectedReport
    ? selectedReport.subjects
        .filter((s) => !s.isConceptual && s.cursoAsignaturaId)
        .reduce((acc, s) => acc + s.notasPeriodo2.length, 0)
    : 0;

  const totalNotasSeleccionadas = (importP1 ? notasP1Count : 0) + (importP2 ? notasP2Count : 0);

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
                  <span>Etapa 19F — Importación PDF Periodo 1 y Periodo 2 (RPC UTP)</span>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
                  Importador de Calificaciones Históricas desde PDF
                </h1>
                <p className="mt-1 text-sm text-zinc-600">
                  Detecta, valida e importa notas numéricas del 1° y 2° Semestre mediante procedimiento seguro en Supabase.
                  Permite seleccionar qué semestres importar, omite duplicados y no modifica notas existentes.
                </p>
              </div>

              {reports.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearReports}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 cursor-pointer"
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
                  Detecta notas numéricas de ambos semestres. Los promedios y notas conceptuales permanecen únicamente como validación.
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
                <p className="mt-1 text-xs text-zinc-500">
                  {totalNotasGlobal} notas (P1: {totalNotasP1Global}, P2: {totalNotasP2Global})
                </p>
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
                <p className="mt-1 text-xs text-amber-600">Conflictos o asignaturas pendientes</p>
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
                          className={`w-full text-left p-3.5 transition flex flex-col gap-1.5 cursor-pointer ${
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

                          {/* Mini resumen de notas por semestre */}
                          <div className="mt-1 flex flex-wrap gap-1 text-[10px] border-t border-zinc-100 pt-1.5 font-medium">
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800 border border-blue-200 font-bold">
                              P1: {rep.totalNotasPeriodo1}
                            </span>
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-800 border border-indigo-200 font-bold">
                              P2: {rep.totalNotasPeriodo2}
                            </span>
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 border border-emerald-100">
                              Nuevas: {rep.notasNuevasCount}
                            </span>
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 border border-zinc-200">
                              Dup: {rep.notasDuplicadasCount}
                            </span>
                            {rep.notasConflictosCount > 0 && (
                              <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 border border-red-200 font-bold">
                                Conf: {rep.notasConflictosCount}
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
                    {/* Alerta de error si ocurrió al intentar importar */}
                    {importErrorMessage && (
                      <div className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-900 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <svg className="h-5 w-5 text-red-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="font-bold text-red-800">No se pudo completar la importación:</p>
                            <p className="mt-1 text-red-700 leading-relaxed">{importErrorMessage}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setImportErrorMessage(null)}
                          className="text-red-600 hover:text-red-800 font-bold text-sm cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Tarjeta de Encabezado de Validación */}
                    <div className="border-b border-zinc-200 pb-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                            Resultado de Detección Semestres 1 y 2
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

                      {/* Resumen por Semestre (Periodo 1 y Periodo 2) y Total General (Requisito 5) */}
                      <div className="mt-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                            Resumen de Calificaciones por Semestre
                          </span>
                          <span className="text-xs text-zinc-500 font-medium">
                            Total general informado: <strong className="text-zinc-800">{selectedReport.totalNotasPeriodo1 + selectedReport.totalNotasPeriodo2} notas</strong>
                          </span>
                        </div>

                        {/* Bloque Periodo 1 */}
                        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-blue-600 inline-block"></span>
                              1° Semestre (P1) — {selectedReport.totalNotasPeriodo1} notas detectadas
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                            <div className="rounded-lg bg-white p-2 border border-blue-100 shadow-2xs">
                              <span className="text-[10px] text-emerald-700 font-bold uppercase block">Nuevas</span>
                              <span className="text-lg font-extrabold text-emerald-700">{selectedReport.p1Summary.nuevasCount}</span>
                              <span className="text-[9px] text-emerald-600 block">Listas para insertar</span>
                            </div>
                            <div className="rounded-lg bg-white p-2 border border-blue-100 shadow-2xs">
                              <span className="text-[10px] text-blue-700 font-bold uppercase block">Duplicadas</span>
                              <span className="text-lg font-extrabold text-blue-700">{selectedReport.p1Summary.duplicadasCount}</span>
                              <span className="text-[9px] text-blue-600 block">Ya registradas</span>
                            </div>
                            <div className="rounded-lg bg-white p-2 border border-blue-100 shadow-2xs">
                              <span className="text-[10px] text-red-700 font-bold uppercase block">Conflictos</span>
                              <span className="text-lg font-extrabold text-red-700">{selectedReport.p1Summary.conflictosCount}</span>
                              <span className="text-[9px] text-red-600 block">Valores diferentes</span>
                            </div>
                            <div className="rounded-lg bg-white p-2 border border-blue-100 shadow-2xs">
                              <span className="text-[10px] text-amber-700 font-bold uppercase block">Eval. Faltantes</span>
                              <span className="text-lg font-extrabold text-amber-700">{selectedReport.p1Summary.evaluacionesFaltantesCount}</span>
                              <span className="text-[9px] text-amber-600 block">A crear en P1</span>
                            </div>
                          </div>
                        </div>

                        {/* Bloque Periodo 2 */}
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-indigo-600 inline-block"></span>
                              2° Semestre (P2) — {selectedReport.totalNotasPeriodo2} notas detectadas
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                            <div className="rounded-lg bg-white p-2 border border-indigo-100 shadow-2xs">
                              <span className="text-[10px] text-emerald-700 font-bold uppercase block">Nuevas</span>
                              <span className="text-lg font-extrabold text-emerald-700">{selectedReport.p2Summary.nuevasCount}</span>
                              <span className="text-[9px] text-emerald-600 block">Listas para insertar</span>
                            </div>
                            <div className="rounded-lg bg-white p-2 border border-indigo-100 shadow-2xs">
                              <span className="text-[10px] text-blue-700 font-bold uppercase block">Duplicadas</span>
                              <span className="text-lg font-extrabold text-blue-700">{selectedReport.p2Summary.duplicadasCount}</span>
                              <span className="text-[9px] text-blue-600 block">Ya registradas</span>
                            </div>
                            <div className="rounded-lg bg-white p-2 border border-indigo-100 shadow-2xs">
                              <span className="text-[10px] text-red-700 font-bold uppercase block">Conflictos</span>
                              <span className="text-lg font-extrabold text-red-700">{selectedReport.p2Summary.conflictosCount}</span>
                              <span className="text-[9px] text-red-600 block">Valores diferentes</span>
                            </div>
                            <div className="rounded-lg bg-white p-2 border border-indigo-100 shadow-2xs">
                              <span className="text-[10px] text-amber-700 font-bold uppercase block">Eval. Faltantes</span>
                              <span className="text-lg font-extrabold text-amber-700">{selectedReport.p2Summary.evaluacionesFaltantesCount}</span>
                              <span className="text-[9px] text-amber-600 block">A crear en P2</span>
                            </div>
                          </div>
                        </div>

                        {/* Bloque Total General */}
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs pt-1">
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
                            <span className="text-[10px] font-bold text-emerald-800 uppercase block">Total Nuevas</span>
                            <span className="text-xl font-extrabold text-emerald-700">{selectedReport.notasNuevasCount}</span>
                          </div>
                          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-2.5">
                            <span className="text-[10px] font-bold text-blue-800 uppercase block">Total Duplicadas</span>
                            <span className="text-xl font-extrabold text-blue-700">{selectedReport.notasDuplicadasCount}</span>
                          </div>
                          <div
                            className={`rounded-xl border p-2.5 ${
                              selectedReport.notasConflictosCount > 0
                                ? "border-red-300 bg-red-50/80"
                                : "border-zinc-200 bg-zinc-50"
                            }`}
                          >
                            <span
                              className={`text-[10px] font-bold uppercase block ${
                                selectedReport.notasConflictosCount > 0 ? "text-red-800" : "text-zinc-600"
                              }`}
                            >
                              Total Conflictos
                            </span>
                            <span
                              className={`text-xl font-extrabold ${
                                selectedReport.notasConflictosCount > 0 ? "text-red-700" : "text-zinc-700"
                              }`}
                            >
                              {selectedReport.notasConflictosCount}
                            </span>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5">
                            <span className="text-[10px] font-bold text-amber-800 uppercase block">Total Eval. Faltantes</span>
                            <span className="text-xl font-extrabold text-amber-700">{selectedReport.evaluacionesFaltantesCount}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Vista Previa Detallada por Asignatura (Requisito 3) */}
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-zinc-900">
                          Detalle por Asignatura y Evaluaciones ({selectedReport.subjects.length})
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          <span>
                            P1: <strong className="text-blue-700">{selectedReport.totalNotasPeriodo1} notas</strong>
                          </span>
                          <span>•</span>
                          <span>
                            P2: <strong className="text-indigo-700">{selectedReport.totalNotasPeriodo2} notas</strong>
                          </span>
                        </div>
                      </div>

                      {selectedReport.subjects.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-xs text-zinc-500">
                          No se identificaron asignaturas en este archivo.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedReport.subjects.map((sub, sIdx) => {
                            const subKey = `${selectedReport.fileName}-${sub.asignaturaPdf}-${sIdx}`;
                            const isExpanded = expandedSubjects[subKey] ?? true;

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
                                <div className="p-3.5 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
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
                                      {/* Promedio Final: solo informativo (Requisito 3) */}
                                      {sub.promedioFinal !== null && (
                                        <span className="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-semibold text-purple-700" title="Promedio final calculado en PDF — No se importa como calificación">
                                          Promedio Final: {sub.promedioFinal.toFixed(1).replace(".", ",")} (informativo)
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

                                  {/* Resumen Periodo 1 y Periodo 2 (Requisito 3) */}
                                  <div className="flex flex-wrap items-center gap-3 text-xs">
                                    {/* 1° Semestre */}
                                    <div className="rounded-lg bg-blue-50/60 border border-blue-200/70 p-2 min-w-[130px]">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-bold text-blue-900 uppercase">1° Semestre</span>
                                        {sub.promedioP1 !== null && (
                                          <span className="text-[10px] text-blue-700 font-mono font-bold" title="Promedio informado P1 (solo validación)">
                                            Prom: {sub.promedioP1.toFixed(1).replace(".", ",")}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {sub.notasPeriodo1.length > 0 ? (
                                          sub.notasPeriodo1.map((n, nIdx) => (
                                            <span
                                              key={nIdx}
                                              className="inline-flex items-center rounded bg-white border border-blue-200 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-900"
                                            >
                                              {n.toFixed(1).replace(".", ",")}
                                            </span>
                                          ))
                                        ) : sub.isConceptual ? (
                                          sub.conceptualNotas?.map((c, cIdx) => (
                                            <span
                                              key={cIdx}
                                              className="inline-flex items-center rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-zinc-600 border border-zinc-200"
                                            >
                                              {c}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-zinc-400 italic text-[11px]">Sin notas</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* 2° Semestre */}
                                    <div className="rounded-lg bg-indigo-50/60 border border-indigo-200/70 p-2 min-w-[130px]">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-bold text-indigo-900 uppercase">2° Semestre</span>
                                        {sub.promedioP2 !== null && (
                                          <span className="text-[10px] text-indigo-700 font-mono font-bold" title="Promedio informado P2 (solo validación)">
                                            Prom: {sub.promedioP2.toFixed(1).replace(".", ",")}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {sub.notasPeriodo2.length > 0 ? (
                                          sub.notasPeriodo2.map((n, nIdx) => (
                                            <span
                                              key={nIdx}
                                              className="inline-flex items-center rounded bg-white border border-indigo-200 px-1.5 py-0.5 font-mono text-[11px] font-bold text-indigo-900"
                                            >
                                              {n.toFixed(1).replace(".", ",")}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-zinc-400 italic text-[11px]">Sin notas</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Botón para colapsar/expandir desglose */}
                                    {sub.gradesAnalysis.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSubjectExpansion(subKey)}
                                        className="ml-1 inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer self-center"
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

                                {/* Desglose detallado por Periodo (Requisito 3) */}
                                {sub.gradesAnalysis.length > 0 && isExpanded && (
                                  <div className="border-t border-zinc-100 bg-zinc-50/70 p-3 space-y-3">
                                    {/* Tabla 1° Semestre */}
                                    {sub.gradesAnalysisP1 && sub.gradesAnalysisP1.length > 0 && (
                                      <div>
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[11px] font-bold text-blue-900 uppercase flex items-center gap-1">
                                            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 inline-block"></span>
                                            1° Semestre (P1)
                                          </span>
                                          {sub.promedioP1 !== null && (
                                            <span className="text-[11px] text-zinc-500">
                                              Promedio informado P1: <strong className="text-zinc-800">{sub.promedioP1.toFixed(1).replace(".", ",")}</strong> (solo validación)
                                            </span>
                                          )}
                                        </div>
                                        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                                          <table className="w-full text-left text-xs">
                                            <thead>
                                              <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-bold uppercase text-zinc-500">
                                                <th className="py-1.5 pl-2">Posición PDF</th>
                                                <th className="py-1.5">Nota PDF</th>
                                                <th className="py-1.5">Evaluación Supabase</th>
                                                <th className="py-1.5 text-center">Orden</th>
                                                <th className="py-1.5 text-center">Calificación Sistema</th>
                                                <th className="py-1.5">Estado</th>
                                                <th className="py-1.5 pr-2">Detalle</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-200/50">
                                              {sub.gradesAnalysisP1.map((gItem) => (
                                                <tr
                                                  key={`p1-${gItem.posicion}`}
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
                                                  <td className="py-1.5 pl-2 font-semibold text-zinc-800">
                                                    Nota {gItem.posicion}
                                                  </td>
                                                  <td className="py-1.5 font-mono font-bold text-zinc-900">
                                                    {gItem.notaPdf.toFixed(1).replace(".", ",")}
                                                  </td>
                                                  <td className="py-1.5 text-zinc-700">
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
                                                  <td className="py-1.5 text-center font-mono font-medium text-zinc-600">
                                                    orden {gItem.orden}
                                                  </td>
                                                  <td className="py-1.5 text-center font-mono font-semibold">
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
                                                  <td className="py-1.5">{renderGradeStatusBadge(gItem.status)}</td>
                                                  <td className="py-1.5 pr-2 text-[11px] text-zinc-500">
                                                    {gItem.statusMessage}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}

                                    {/* Tabla 2° Semestre */}
                                    {sub.gradesAnalysisP2 && sub.gradesAnalysisP2.length > 0 && (
                                      <div>
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-[11px] font-bold text-indigo-900 uppercase flex items-center gap-1">
                                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 inline-block"></span>
                                            2° Semestre (P2)
                                          </span>
                                          {sub.promedioP2 !== null && (
                                            <span className="text-[11px] text-zinc-500">
                                              Promedio informado P2: <strong className="text-zinc-800">{sub.promedioP2.toFixed(1).replace(".", ",")}</strong> (solo validación)
                                            </span>
                                          )}
                                        </div>
                                        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                                          <table className="w-full text-left text-xs">
                                            <thead>
                                              <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-bold uppercase text-zinc-500">
                                                <th className="py-1.5 pl-2">Posición PDF</th>
                                                <th className="py-1.5">Nota PDF</th>
                                                <th className="py-1.5">Evaluación Supabase</th>
                                                <th className="py-1.5 text-center">Orden</th>
                                                <th className="py-1.5 text-center">Calificación Sistema</th>
                                                <th className="py-1.5">Estado</th>
                                                <th className="py-1.5 pr-2">Detalle</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-200/50">
                                              {sub.gradesAnalysisP2.map((gItem) => (
                                                <tr
                                                  key={`p2-${gItem.posicion}`}
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
                                                  <td className="py-1.5 pl-2 font-semibold text-zinc-800">
                                                    Nota {gItem.posicion}
                                                  </td>
                                                  <td className="py-1.5 font-mono font-bold text-zinc-900">
                                                    {gItem.notaPdf.toFixed(1).replace(".", ",")}
                                                  </td>
                                                  <td className="py-1.5 text-zinc-700">
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
                                                  <td className="py-1.5 text-center font-mono font-medium text-zinc-600">
                                                    orden {gItem.orden}
                                                  </td>
                                                  <td className="py-1.5 text-center font-mono font-semibold">
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
                                                  <td className="py-1.5">{renderGradeStatusBadge(gItem.status)}</td>
                                                  <td className="py-1.5 pr-2 text-[11px] text-zinc-500">
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
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Zona de Acción: Botón de Importación Real */}
                    <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs text-zinc-600">
                        <p className="font-semibold text-zinc-900">Estado de Importación Histórica:</p>
                        <p className="mt-0.5">
                          {selectedReport.overallStatus === "LISTO_PARA_IMPORTAR"
                            ? `Listo para importar: se ingresarán ${notasP1Count} notas de P1 y ${notasP2Count} notas de P2. Las calificaciones existentes no serán modificadas.`
                            : selectedReport.overallStatus === "DUPLICADO"
                            ? "Todas las notas del informe ya se encuentran registradas en Supabase con valores idénticos."
                            : selectedReport.overallStatus === "REVISAR"
                            ? "Existen discrepancias, asignaturas manuales pendientes o conflictos de notas que deben atenderse antes de importar."
                            : "El informe presenta errores estructurales que impiden su procesamiento."}
                        </p>
                      </div>

                      {selectedReport.overallStatus === "LISTO_PARA_IMPORTAR" ? (
                        <button
                          type="button"
                          onClick={() => setIsConfirmModalOpen(true)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition cursor-pointer shrink-0"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Confirmar e importar
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-200 px-5 py-2.5 text-xs font-bold text-zinc-500 shadow-none cursor-not-allowed opacity-80 shrink-0"
                          title="Solo disponible cuando el informe se encuentre en estado LISTO PARA IMPORTAR"
                        >
                          <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          {selectedReport.overallStatus === "DUPLICADO"
                            ? "Notas ya importadas"
                            : "Importación no disponible"}
                        </button>
                      )}
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

          {/* Modal de Confirmación Previo a la Importación (Requisitos 10 y 11) */}
          {isConfirmModalOpen && selectedReport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-emerald-100 p-2.5 text-emerald-700">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900">
                      Confirmar Importación Histórica
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Acción protegida para usuario UTP autenticado
                    </p>
                  </div>
                </div>

                {/* Texto exacto según Requisito 10 */}
                <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-xs text-emerald-950">
                  <p className="font-bold text-emerald-900 text-sm">
                    Se importarán:
                  </p>
                  <p className="mt-1 font-semibold text-emerald-900">
                    {importP1 ? notasP1Count : 0} notas del 1° Semestre
                  </p>
                  <p className="font-semibold text-emerald-900">
                    {importP2 ? notasP2Count : 0} notas del 2° Semestre
                  </p>
                  <p className="mt-2 text-emerald-800 font-medium">
                    Las notas existentes no serán modificadas.
                  </p>
                </div>

                {/* Opciones de Selección con Checkboxes (Requisito 11) */}
                <div className="mt-4 rounded-xl bg-zinc-50 p-3.5 border border-zinc-200 space-y-2.5">
                  <span className="text-xs font-bold text-zinc-800 block">
                    Seleccionar periodos a importar:
                  </span>
                  <div className="space-y-2 text-xs">
                    <label className="flex items-center gap-2.5 cursor-pointer font-medium text-zinc-800">
                      <input
                        type="checkbox"
                        checked={importP1}
                        onChange={(e) => setImportP1(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>
                        Importar 1° Semestre{" "}
                        <strong className="text-blue-700">({notasP1Count} notas)</strong>
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer font-medium text-zinc-800">
                      <input
                        type="checkbox"
                        checked={importP2}
                        onChange={(e) => setImportP2(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span>
                        Importar 2° Semestre{" "}
                        <strong className="text-indigo-700">({notasP2Count} notas)</strong>
                      </span>
                    </label>
                  </div>

                  {!importP1 && !importP2 && (
                    <p className="text-[11px] font-semibold text-red-600 mt-1">
                      ⚠️ Debe marcar al menos un semestre para poder importar.
                    </p>
                  )}
                </div>

                {/* Datos del estudiante */}
                <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs border border-zinc-200 text-zinc-700 space-y-1">
                  <p>
                    <strong className="text-zinc-900">Estudiante:</strong>{" "}
                    {selectedReport.systemStudent
                      ? `${selectedReport.systemStudent.nombres} ${selectedReport.systemStudent.apellidos}`
                      : selectedReport.estudiantePdf}
                  </p>
                  <p>
                    <strong className="text-zinc-900">Curso:</strong> {selectedReport.systemCourse?.nombre || selectedReport.cursoPdf}
                  </p>
                  <p>
                    <strong className="text-zinc-900">RUN:</strong> {selectedReport.rawRunPdf}
                  </p>
                  <p>
                    <strong className="text-zinc-900">Total a procesar en lote:</strong>{" "}
                    <span className="font-bold text-zinc-900">{totalNotasSeleccionadas} calificaciones</span>
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-100 pt-4">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => setIsConfirmModalOpen(false)}
                    className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isImporting || (!importP1 && !importP2) || totalNotasSeleccionadas === 0}
                    onClick={handleExecuteImport}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50"
                  >
                    {isImporting ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                        Importando en Supabase...
                      </>
                    ) : (
                      `Confirmar e importar (${totalNotasSeleccionadas})`
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Resultado de la Importación */}
          {isResultModalOpen && importResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-100 p-2.5 text-blue-700">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900">
                      Resumen de Importación de Calificaciones
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Operación procesada por la función RPC en Supabase
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase block">Insertadas</span>
                    <span className="mt-1 text-2xl font-extrabold text-emerald-700 block">
                      {importResult.insertadas}
                    </span>
                    <span className="text-[10px] text-emerald-600">Nuevas en sistema</span>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-center">
                    <span className="text-[10px] font-bold text-blue-800 uppercase block">Duplicadas</span>
                    <span className="mt-1 text-2xl font-extrabold text-blue-700 block">
                      {importResult.duplicadas}
                    </span>
                    <span className="text-[10px] text-blue-600">Omitidas (idénticas)</span>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-center">
                    <span className="text-[10px] font-bold text-amber-800 uppercase block">Eval. Creadas</span>
                    <span className="mt-1 text-2xl font-extrabold text-amber-700 block">
                      {importResult.evaluaciones_creadas}
                    </span>
                    <span className="text-[10px] text-amber-600">Históricas P1/P2</span>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-center">
                    <span className="text-[10px] font-bold text-zinc-700 uppercase block">Conflictos</span>
                    <span className="mt-1 text-2xl font-extrabold text-zinc-700 block">
                      {importResult.conflictos}
                    </span>
                    <span className="text-[10px] text-zinc-500">Protegidas</span>
                  </div>
                </div>

                {importResult.errores && importResult.errores.length > 0 && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs">
                    <p className="font-bold text-red-800">Errores puntuales reportados ({importResult.errores.length}):</p>
                    <ul className="mt-1 max-h-32 overflow-y-auto space-y-1 text-red-700 list-disc list-inside">
                      {importResult.errores.map((errItem, idx) => (
                        <li key={idx}>
                          P{errItem.periodo || "?"} Orden {errItem.orden}: {errItem.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="mt-4 text-xs text-zinc-500">
                  La validación ha sido refrescada. Las notas insertadas se visualizan ahora como duplicadas garantizando consistencia total.
                </p>

                <div className="mt-6 flex justify-end border-t border-zinc-100 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResultModalOpen(false);
                      setImportResult(null);
                    }}
                    className="rounded-lg bg-blue-900 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition cursor-pointer"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
