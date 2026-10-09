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
  DbPeriodo,
} from "@/types/dashboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface StudentConsolidatedClientProps {
  courseId: string;
  studentId: string;
  institution: InstitutionalInfo;
}

export interface ConsolidatedCell {
  evalId: number | null;
  evalNombre: string;
  notaNum: number | null;
  display: string;
}

export interface SemesterDetail {
  periodoNumero: number;
  notas: ConsolidatedCell[];
  promedioNum: number | null;
  promedioText: string;
}

export interface SubjectConsolidated {
  asignaturaId: number;
  asignaturaNombre: string;
  docente: string;
  incidePromedio: boolean;
  semestre1: SemesterDetail;
  semestre2: SemesterDetail;
  promedioAnualNum: number | null;
  promedioAnualText: string;
  esProvisional: boolean;
  esDefinitivo: boolean;
}

export interface StudentAnnualConsolidated {
  student: DbStudent;
  curso: DbCursoInfo;
  periodos: DbPeriodo[];
  asignaturas: SubjectConsolidated[];
  promedioGeneralS1: string;
  promedioGeneralS2: string;
  promedioGeneralAnual: string;
}

interface DbCursoInfo {
  id: number;
  nombre: string;
  nivel?: string;
  letra?: string;
  anio?: number;
  profesor_jefe_id?: number | null;
}

export type TabKey = "1" | "2" | "anual";

// ==========================================
// FUNCIONES DE CÁLCULO REUTILIZABLES (PREPARACIÓN PDF)
// ==========================================

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatGrade(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "-";
  }
  return value.toFixed(1).replace(".", ",");
}

export function computeSemesterDetail(
  caEvals: DbEvaluacion[],
  califsMap: Record<number, number>,
  maxColsCount: number,
  periodoNumero: number
): SemesterDetail {
  const cells: ConsolidatedCell[] = [];
  const validGrades: number[] = [];

  for (let colIdx = 0; colIdx < maxColsCount; colIdx++) {
    const ev = caEvals[colIdx];
    if (ev) {
      const notaVal = califsMap[ev.id];
      if (notaVal !== undefined && notaVal !== null && notaVal > 0) {
        cells.push({
          evalId: ev.id,
          evalNombre: ev.nombre,
          notaNum: notaVal,
          display: formatGrade(notaVal),
        });
        validGrades.push(notaVal);
      } else {
        cells.push({
          evalId: ev.id,
          evalNombre: ev.nombre,
          notaNum: null,
          display: "-",
        });
      }
    } else {
      cells.push({
        evalId: null,
        evalNombre: `Nota ${colIdx + 1}`,
        notaNum: null,
        display: "-",
      });
    }
  }

  let promedioNum: number | null = null;
  let promedioText = "-";

  if (validGrades.length > 0) {
    const sum = validGrades.reduce((acc, curr) => acc + curr, 0);
    const avg = sum / validGrades.length;
    promedioNum = roundToOneDecimal(avg);
    promedioText = formatGrade(promedioNum);
  }

  return {
    periodoNumero,
    notas: cells,
    promedioNum,
    promedioText,
  };
}

export function computeAnnualSubjectSummary(
  semestre1: SemesterDetail,
  semestre2: SemesterDetail
): {
  promedioAnualNum: number | null;
  promedioAnualText: string;
  esProvisional: boolean;
  esDefinitivo: boolean;
} {
  const p1 = semestre1.promedioNum;
  const p2 = semestre2.promedioNum;

  // A) Si existen promedio S1 Y promedio S2:
  //    promedioAnual = round((promedioS1 + promedioS2) / 2, 1);
  //    Estado: "Final"
  if (p1 !== null && p2 !== null) {
    const promAnual = roundToOneDecimal((p1 + p2) / 2);
    return {
      promedioAnualNum: promAnual,
      promedioAnualText: formatGrade(promAnual),
      esProvisional: false,
      esDefinitivo: true,
    };
  }

  // B) Si solamente existe un semestre con promedio:
  //    mostrar ese valor como "Promedio provisional", NO presentarlo como promedio anual definitivo.
  if (p1 !== null && p2 === null) {
    return {
      promedioAnualNum: p1,
      promedioAnualText: formatGrade(p1),
      esProvisional: true,
      esDefinitivo: false,
    };
  }

  if (p1 === null && p2 !== null) {
    return {
      promedioAnualNum: p2,
      promedioAnualText: formatGrade(p2),
      esProvisional: true,
      esDefinitivo: false,
    };
  }

  // C) Si ninguno tiene notas: mostrar "-"
  return {
    promedioAnualNum: null,
    promedioAnualText: "-",
    esProvisional: false,
    esDefinitivo: false,
  };
}

export function computeGeneralAverages(subjects: SubjectConsolidated[]): {
  generalAvgS1: string;
  generalAvgS2: string;
  generalAvgAnual: string;
} {
  const contributingSubjects = subjects.filter((s) => s.incidePromedio !== false);

  // Pestañas semestrales: promedio general del semestre seleccionado
  const s1Avgs = contributingSubjects
    .map((s) => s.semestre1.promedioNum)
    .filter((v): v is number => v !== null);

  const generalAvgS1 =
    s1Avgs.length > 0
      ? formatGrade(roundToOneDecimal(s1Avgs.reduce((a, b) => a + b, 0) / s1Avgs.length))
      : "-";

  const s2Avgs = contributingSubjects
    .map((s) => s.semestre2.promedioNum)
    .filter((v): v is number => v !== null);

  const generalAvgS2 =
    s2Avgs.length > 0
      ? formatGrade(roundToOneDecimal(s2Avgs.reduce((a, b) => a + b, 0) / s2Avgs.length))
      : "-";

  // Resumen Anual: calcular promedio general anual solamente con asignaturas
  // que tengan promedio anual definitivo. Si no existen: "En curso"
  const definitiveAnnualAvgs = contributingSubjects
    .filter((s) => s.esDefinitivo && s.promedioAnualNum !== null)
    .map((s) => s.promedioAnualNum as number);

  const generalAvgAnual =
    definitiveAnnualAvgs.length > 0
      ? formatGrade(
          roundToOneDecimal(
            definitiveAnnualAvgs.reduce((a, b) => a + b, 0) / definitiveAnnualAvgs.length
          )
        )
      : "En curso";

  return { generalAvgS1, generalAvgS2, generalAvgAnual };
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

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

  // Pestaña activa: "1" (Primer Semestre), "2" (Segundo Semestre), "anual" (Resumen Anual)
  const [activeTab, setActiveTab] = useState<TabKey>("1");

  // Estados de datos obtenidos de Supabase
  const [student, setStudent] = useState<DbStudent | null>(null);
  const [curso, setCurso] = useState<DbCursoInfo | null>(null);
  const [periodos, setPeriodos] = useState<DbPeriodo[]>([]);
  const [columnHeadersS1, setColumnHeadersS1] = useState<string[]>([]);
  const [columnHeadersS2, setColumnHeadersS2] = useState<string[]>([]);
  const [subjectRows, setSubjectRows] = useState<SubjectConsolidated[]>([]);

  // Promedios generales calculados
  const [generalAvgS1, setGeneralAvgS1] = useState<string>("-");
  const [generalAvgS2, setGeneralAvgS2] = useState<string>("-");
  const [generalAvgAnual, setGeneralAvgAnual] = useState<string>("En curso");

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

      if (!cursoData) {
        throw new Error("No fue posible cargar la información del curso asociado al estudiante.");
      }

      if (!cursoData.anio) {
        throw new Error("El año escolar del curso no se encuentra disponible.");
      }

      const resolvedCurso: DbCursoInfo = cursoData as DbCursoInfo;
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

      // 4. CARGAR PERÍODOS DEL AÑO (Requisito 1)
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

      // Selección inicial de pestaña según período (Requisito 11):
      // - Seleccionar automáticamente el período activo
      // - Si no existe, seleccionar el primero disponible
      if (loadedPeriodos.length > 0) {
        const activePeriod = loadedPeriodos.find((p) => p.activo === true);
        if (activePeriod) {
          setActiveTab(String(activePeriod.numero) as TabKey);
        } else {
          setActiveTab(String(loadedPeriodos[0].numero) as TabKey);
        }
      }

      // 5. Obtener asignaturas asociadas al curso mediante curso_asignaturas y sus docentes asociados
      const { data: caData, error: caErr } = await supabase
        .from("curso_asignaturas")
        .select(
          "id, curso_id, asignatura_id, docente_id, incide_promedio, asignaturas(id, nombre, activo), docentes(id, nombres, apellidos, email, activo)"
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

      const validCaIds = validCaRows.map((ca) => ca.id);

      // 6. CARGAR TODAS LAS EVALUACIONES DEL AÑO (Requisito 2: sin filtrar solo período 2)
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

      // 7. CALIFICACIONES DEL ESTUDIANTE DE AMBOS SEMESTRES (Requisito 3)
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
            // Requisito 5: No considerar celdas vacías ni 0 como nota
            if (c.nota !== null && c.nota !== undefined && !isNaN(c.nota) && c.nota > 0) {
              califsMap[c.evaluacion_id] = c.nota;
            }
          });
        }
      }

      // 8. ORGANIZAR DATOS POR PERÍODO (Requisitos 4, 5, 6, 7)
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

      // Determinar cantidad de columnas para Semestre 1 y Semestre 2 (mínimo 3)
      let maxColsS1 = 3;
      let maxColsS2 = 3;
      validCaRows.forEach((ca) => {
        const c1 = evalsByCaAndPeriod[ca.id][1].length;
        if (c1 > maxColsS1) maxColsS1 = c1;
        const c2 = evalsByCaAndPeriod[ca.id][2].length;
        if (c2 > maxColsS2) maxColsS2 = c2;
      });

      const dynamicHeadersS1 = Array.from(
        { length: maxColsS1 },
        (_, i) => `Nota ${i + 1}`
      );
      const dynamicHeadersS2 = Array.from(
        { length: maxColsS2 },
        (_, i) => `Nota ${i + 1}`
      );
      setColumnHeadersS1(dynamicHeadersS1);
      setColumnHeadersS2(dynamicHeadersS2);

      // Construir filas de asignaturas con sus cálculos semestrales y anuales
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

      // 9. CÁLCULO DE PROMEDIOS GENERALES (Requisito 9)
      const { generalAvgS1, generalAvgS2, generalAvgAnual } = computeGeneralAverages(rows);
      setGeneralAvgS1(generalAvgS1);
      setGeneralAvgS2(generalAvgS2);
      setGeneralAvgAnual(generalAvgAnual);
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

  const courseDisplayName = curso?.nombre || "Cargando curso...";
  const schoolYear = curso?.anio ? String(curso.anio) : "Año escolar no disponible";

  // Estados de períodos
  const periodoS1 = periodos.find((p) => p.numero === 1);
  const periodoS2 = periodos.find((p) => p.numero === 2);
  const currentTabPeriod =
    activeTab === "1" ? periodoS1 : activeTab === "2" ? periodoS2 : null;

  const currentTabName =
    activeTab === "1"
      ? (periodoS1?.nombre || "Primer Semestre")
      : activeTab === "2"
      ? (periodoS2?.nombre || "Segundo Semestre")
      : "Resumen Anual";

  const displayedGeneralAverage =
    activeTab === "1"
      ? generalAvgS1
      : activeTab === "2"
      ? generalAvgS2
      : generalAvgAnual;

  const currentHeaders = activeTab === "1" ? columnHeadersS1 : columnHeadersS2;

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

        {/* Vista Bloqueada por Autorización: Solo UTP o Profesor Jefe del curso (Requisito 12) */}
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
            {/* Navegación y Botón Volver al curso */}
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
                    Consultando períodos académicos, calificaciones y asignaturas oficiales.
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

            {/* ESTADO VISUAL: ESTUDIANTE NO ENCONTRADO */}
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

            {/* ESTADO VISUAL: SIN PERÍODOS CONFIGURADOS (Requisito 14) */}
            {!isLoading && !loadError && student && periodos.length === 0 && (
              <div className="bg-white rounded-2xl border border-amber-200 p-8 sm:p-12 text-center space-y-4 max-w-xl mx-auto shadow-xs">
                <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Períodos no encontrados
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">
                    No existen períodos académicos configurados para este año.
                  </p>
                </div>
                <Link
                  href={`/cursos/${courseId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-colors"
                >
                  Volver al curso
                </Link>
              </div>
            )}

            {/* VISTA PRINCIPAL CON DATOS REALES DE SUPABASE */}
            {!isLoading && !loadError && student && periodos.length > 0 && (
              <>
                {/* FICHA PRINCIPAL DEL ESTUDIANTE */}
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

                    {/* Bloque de parámetros institucionales y Promedio General (Requisitos 9 y 10) */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center min-w-[110px]">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                          Año escolar
                        </span>
                        <span className="text-base font-extrabold text-slate-900">
                          {schoolYear}
                        </span>
                      </div>

                      <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center min-w-[140px]">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                          Periodo
                        </span>
                        <span className="text-base font-extrabold text-slate-900 block truncate">
                          {currentTabName}
                        </span>
                        {/* Estado del período (Requisito 10) */}
                        {activeTab !== "anual" && currentTabPeriod && (
                          <div className="flex items-center justify-center gap-1.5 mt-1">
                            <span
                              className={`px-2 py-0.2 rounded-full text-[10px] font-bold border ${
                                currentTabPeriod.cerrado
                                  ? "bg-slate-100 text-slate-700 border-slate-300"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {currentTabPeriod.cerrado ? "Cerrado" : "Abierto"}
                            </span>
                            {currentTabPeriod.activo && (
                              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                Actual
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Promedio General del Estudiante (Requisito 9) */}
                      <div className="bg-blue-50 px-4 py-2.5 rounded-xl border border-blue-200 text-center min-w-[140px]">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 block">
                          {activeTab === "anual" ? "Promedio Anual" : "Promedio General"}
                        </span>
                        <span
                          className={`text-xl font-black ${
                            displayedGeneralAverage === "En curso"
                              ? "text-amber-800 text-base"
                              : "text-blue-950"
                          }`}
                        >
                          {displayedGeneralAverage}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Barra de herramientas: Botón Vista previa de libreta */}
                  <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="text-xs text-slate-500">
                      Calificaciones recuperadas en tiempo real desde Supabase para el periodo lectivo oficial.
                    </div>

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/cursos/${courseId}/estudiantes/${studentId}/libreta`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-900"
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
                      </Link>
                    </div>
                  </div>
                </section>

                {/* SELECTOR DE PESTAÑAS (Requisitos 7, 10, 11) */}
                <div className="bg-white rounded-xl border border-slate-200/90 p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1 overflow-x-auto">
                    {/* Pestaña 1: Primer Semestre */}
                    <button
                      type="button"
                      onClick={() => setActiveTab("1")}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                        activeTab === "1"
                          ? "bg-[#0f2942] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                      }`}
                    >
                      <span>Primer Semestre</span>
                      {periodoS1?.activo && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            activeTab === "1"
                              ? "bg-blue-300/30 text-blue-200"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          Actual
                        </span>
                      )}
                    </button>

                    {/* Pestaña 2: Segundo Semestre */}
                    <button
                      type="button"
                      onClick={() => setActiveTab("2")}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                        activeTab === "2"
                          ? "bg-[#0f2942] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                      }`}
                    >
                      <span>Segundo Semestre</span>
                      {periodoS2?.activo && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            activeTab === "2"
                              ? "bg-blue-300/30 text-blue-200"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          Actual
                        </span>
                      )}
                    </button>

                    {/* Pestaña 3: Resumen Anual */}
                    <button
                      type="button"
                      onClick={() => setActiveTab("anual")}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === "anual"
                          ? "bg-[#0f2942] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                      }`}
                    >
                      Resumen Anual
                    </button>
                  </div>

                  {/* Estado del período semestral (Requisito 10) */}
                  {activeTab !== "anual" && currentTabPeriod && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500 font-medium">Estado del período:</span>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                          currentTabPeriod.cerrado
                            ? "bg-slate-100 text-slate-700 border-slate-300"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {currentTabPeriod.cerrado ? "Cerrado" : "Abierto"}
                      </span>
                      {currentTabPeriod.activo && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Actual
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* VISTA 1 & 2: TABLAS DETALLADAS POR SEMESTRE (Requisito 7) */}
                {activeTab !== "anual" && (
                  <section className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                    {subjectRows.length === 0 ? (
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
                              {currentHeaders.map((headerText, colIdx) => (
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
                            {subjectRows.map((row) => {
                              const semData = activeTab === "1" ? row.semestre1 : row.semestre2;
                              const isFailing = semData.promedioNum !== null && semData.promedioNum < 4.0;

                              return (
                                <tr
                                  key={row.asignaturaId}
                                  className="hover:bg-blue-50/20 transition-colors"
                                >
                                  {/* Nombre de la Asignatura y Docente */}
                                  <td className="px-6 py-4 border-r border-slate-200">
                                    <div>
                                      <span className="font-bold text-slate-900 text-sm block">
                                        {row.asignaturaNombre}{row.incidePromedio === false ? " (*)" : ""}
                                      </span>
                                      <span className="text-xs text-slate-500 mt-0.5 block">
                                        Docente: {row.docente}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Columnas de evaluaciones del semestre seleccionado */}
                                  {semData.notas.map((cell, colIdx) => {
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

                                  {/* Promedio de la asignatura en el semestre */}
                                  <td className="px-5 py-4 text-center bg-slate-50/70">
                                    <span
                                      className={`inline-block px-3 py-1 rounded-md text-xs sm:text-sm font-extrabold ${
                                        isFailing
                                          ? "text-rose-700 bg-rose-100 border border-rose-200"
                                          : semData.promedioNum !== null
                                          ? "text-blue-900 bg-blue-100/80 border border-blue-200"
                                          : "text-slate-400 font-normal"
                                      }`}
                                    >
                                      {semData.promedioText}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>

                          {/* Fila final con Promedio General del semestre */}
                          <tfoot className="bg-slate-100/90 font-bold border-t-2 border-slate-300 text-slate-900 text-xs sm:text-sm">
                            <tr>
                              <td
                                colSpan={currentHeaders.length + 1}
                                className="px-6 py-3.5 text-right uppercase tracking-wider text-slate-600 border-r border-slate-200"
                              >
                                {activeTab === "1"
                                  ? "Promedio General 1° Semestre:"
                                  : "Promedio General 2° Semestre:"}
                              </td>
                              <td className="px-5 py-3.5 text-center bg-blue-900 text-white font-extrabold text-sm">
                                {activeTab === "1" ? generalAvgS1 : generalAvgS2}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Pie de tabla informativo */}
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-3">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-900 inline-block"></span>
                          Aprobado (≥ 4,0)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
                          Insuficiente (&lt; 4,0)
                        </span>
                        {subjectRows.some((r) => r.incidePromedio === false) && (
                          <span className="text-slate-600 font-medium">
                            (*) Asignatura que no incide en el promedio general.
                          </span>
                        )}
                      </div>

                      <span>
                        Total asignaturas oficiales: <strong>{subjectRows.length}</strong> · Régimen Escolar {schoolYear}
                      </span>
                    </div>
                  </section>
                )}

                {/* VISTA 3: RESUMEN ANUAL COMPACTO (Requisito 8) */}
                {activeTab === "anual" && (
                  <section className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                    {subjectRows.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-sm">
                        No se encontraron asignaturas vinculadas a este curso en Supabase.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead className="bg-[#0f2942] text-white text-xs font-semibold uppercase tracking-wider select-none">
                            <tr>
                              <th scope="col" className="px-6 py-3.5 min-w-[240px] border-r border-[#162a45]">
                                Asignatura
                              </th>
                              <th scope="col" className="px-6 py-3.5 min-w-[200px] border-r border-[#162a45]">
                                Docente
                              </th>
                              <th scope="col" className="px-5 py-3.5 w-36 text-center border-r border-[#162a45] bg-[#0b2138]">
                                Prom. 1° Semestre
                              </th>
                              <th scope="col" className="px-5 py-3.5 w-36 text-center border-r border-[#162a45] bg-[#0b2138]">
                                Prom. 2° Semestre
                              </th>
                              <th scope="col" className="px-5 py-3.5 w-44 text-center bg-[#081729]">
                                <span className="text-blue-200">Promedio Anual</span>
                              </th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-200 text-slate-800">
                            {subjectRows.map((row) => {
                              const s1Failing = row.semestre1.promedioNum !== null && row.semestre1.promedioNum < 4.0;
                              const s2Failing = row.semestre2.promedioNum !== null && row.semestre2.promedioNum < 4.0;
                              const anualFailing = row.promedioAnualNum !== null && row.promedioAnualNum < 4.0;

                              return (
                                <tr
                                  key={row.asignaturaId}
                                  className="hover:bg-blue-50/20 transition-colors"
                                >
                                  {/* Asignatura */}
                                  <td className="px-6 py-4 border-r border-slate-200">
                                    <span className="font-bold text-slate-900 text-sm block">
                                      {row.asignaturaNombre}{row.incidePromedio === false ? " (*)" : ""}
                                    </span>
                                  </td>

                                  {/* Docente */}
                                  <td className="px-6 py-4 border-r border-slate-200 text-xs text-slate-600">
                                    {row.docente}
                                  </td>

                                  {/* Promedio 1° Semestre */}
                                  <td className="px-5 py-4 text-center border-r border-slate-200">
                                    <span
                                      className={`inline-block px-3 py-1 rounded-md text-xs sm:text-sm font-bold ${
                                        row.semestre1.promedioNum === null
                                          ? "text-slate-400 font-normal"
                                          : s1Failing
                                          ? "text-rose-700 bg-rose-50 border border-rose-200 font-extrabold"
                                          : "text-blue-950 font-extrabold"
                                      }`}
                                    >
                                      {row.semestre1.promedioText}
                                    </span>
                                  </td>

                                  {/* Promedio 2° Semestre */}
                                  <td className="px-5 py-4 text-center border-r border-slate-200">
                                    <span
                                      className={`inline-block px-3 py-1 rounded-md text-xs sm:text-sm font-bold ${
                                        row.semestre2.promedioNum === null
                                          ? "text-slate-400 font-normal"
                                          : s2Failing
                                          ? "text-rose-700 bg-rose-50 border border-rose-200 font-extrabold"
                                          : "text-blue-950 font-extrabold"
                                      }`}
                                    >
                                      {row.semestre2.promedioText}
                                    </span>
                                  </td>

                                  {/* Promedio Anual (Requisito 8: si provisional muestra etiqueta, si definitivo solo valor) */}
                                  <td className="px-5 py-4 text-center bg-slate-50/70">
                                    {row.promedioAnualNum === null ? (
                                      <span className="text-slate-400 text-sm">-</span>
                                    ) : (
                                      <div className="inline-flex items-center justify-center gap-2">
                                        <span
                                          className={`inline-block px-3 py-1 rounded-md text-xs sm:text-sm font-extrabold ${
                                            anualFailing
                                              ? "text-rose-700 bg-rose-100 border border-rose-200"
                                              : "text-blue-900 bg-blue-100/80 border border-blue-200"
                                          }`}
                                        >
                                          {row.promedioAnualText}
                                        </span>
                                        {row.esProvisional && (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                            Provisional
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>

                          {/* Fila final con Promedio General Anual (Requisito 9) */}
                          <tfoot className="bg-slate-100/90 font-bold border-t-2 border-slate-300 text-slate-900 text-xs sm:text-sm">
                            <tr>
                              <td
                                colSpan={4}
                                className="px-6 py-3.5 text-right uppercase tracking-wider text-slate-600 border-r border-slate-200"
                              >
                                Promedio General Anual:
                              </td>
                              <td className="px-5 py-3.5 text-center bg-blue-900 text-white font-extrabold text-sm">
                                {generalAvgAnual}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Pie de tabla informativo Resumen Anual */}
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-3">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-900 inline-block"></span>
                          Aprobado (≥ 4,0)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
                          Insuficiente (&lt; 4,0)
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                            Provisional
                          </span>
                          <span>1 semestre con notas</span>
                        </span>
                        {subjectRows.some((r) => r.incidePromedio === false) && (
                          <span className="text-slate-600 font-medium">
                            (*) Asignatura que no incide en el promedio general.
                          </span>
                        )}
                      </div>

                      <span>
                        Total asignaturas oficiales: <strong>{subjectRows.length}</strong> · Régimen Escolar {schoolYear}
                      </span>
                    </div>
                  </section>
                )}
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
