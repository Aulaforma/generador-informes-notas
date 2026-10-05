"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  CourseData,
  Subject,
  InstitutionalInfo,
  NavSection,
  DbEvaluacion,
  DbCalificacion,
  DbStudent,
  DbCurso,
  DbAsignatura,
  DbDocente,
  DbCursoAsignatura,
  DbPeriodo,
} from "@/types/dashboard";
import { useGrades } from "@/context/GradesContext";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface GradeEntryClientProps {
  courseId?: string;
  subjectId?: string;
  course?: CourseData;
  subject?: Subject;
  institution: InstitutionalInfo;
  initialGrades?: { [studentListNumber: number]: string[] };
}

// Función auxiliar para normalizar nombres en comparaciones sin distinción de tildes o mayúsculas
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Función para parsear y validar la calificación (escala chilena 1,0 a 7,0)
const parseGrade = (val: string): number | null => {
  if (!val || val.trim() === "" || val === "—" || val === "-") return null;
  const normalized = val.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const num = parseFloat(normalized);
  if (isNaN(num)) return null;
  if (num >= 1.0 && num <= 7.0) return num;
  return null;
};

// Formatea el valor de visualización del promedio con un decimal
const formatAverage = (gradesList: string[]): { text: string; value: number | null } => {
  const validNumbers = gradesList
    .map(parseGrade)
    .filter((n): n is number => n !== null);

  if (validNumbers.length === 0) {
    return { text: "—", value: null };
  }

  const sum = validNumbers.reduce((acc, curr) => acc + curr, 0);
  const avg = sum / validNumbers.length;
  // Redondeo a 1 decimal
  const rounded = Math.round(avg * 10) / 10;
  return {
    text: rounded.toFixed(1).replace(".", ","),
    value: rounded,
  };
};

export function GradeEntryClient({
  courseId: propCourseId,
  subjectId: propSubjectId,
  course,
  subject,
  institution,
}: GradeEntryClientProps) {
  const currentCourseId = propCourseId || course?.id || "";
  const currentSubjectId = propSubjectId || subject?.id || "";

  const [currentSection, setCurrentSection] = useState<NavSection>("cursos");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { saveSubjectData } = useGrades();
  const { profile, isLoading: authLoading } = useAuth();

  // Estados para datos maestros resueltos dinámicamente desde Supabase
  const [cursoData, setCursoData] = useState<DbCurso | null>(null);
  const [asignaturaData, setAsignaturaData] = useState<DbAsignatura | null>(null);
  const [docenteData, setDocenteData] = useState<DbDocente | null>(null);
  const [cursoAsignaturaId, setCursoAsignaturaId] = useState<number | null>(null);

  // Estados para períodos académicos (Etapa 11C)
  const [periodos, setPeriodos] = useState<DbPeriodo[]>([]);
  const [selectedPeriodoNumero, setSelectedPeriodoNumero] = useState<number | null>(null);
  const [isLoadingGrades, setIsLoadingGrades] = useState<boolean>(false);

  // Período actualmente seleccionado
  const currentPeriodo = useMemo(() => {
    if (selectedPeriodoNumero === null || periodos.length === 0) return null;
    return periodos.find((p) => p.numero === selectedPeriodoNumero) || null;
  }, [selectedPeriodoNumero, periodos]);

  // Indicador de período cerrado (bloquea edición a docentes y UTP)
  const isPeriodoCerrado = currentPeriodo?.cerrado === true;

  // Estado para acceso no autorizado
  const [isUnauthorized, setIsUnauthorized] = useState<boolean>(false);

  // Estados para datos maestros desde Supabase
  const [students, setStudents] = useState<DbStudent[]>([]);
  const [evaluations, setEvaluations] = useState<DbEvaluacion[]>([]);

  // Estados de carga y error principal
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Mapa de calificaciones registradas en la base de datos: key = `${estudiante_id}_${evaluacion_id}`
  const [dbCalificacionesMap, setDbCalificacionesMap] = useState<{
    [key: string]: DbCalificacion;
  }>({});

  // Matriz de valores en pantalla (strings editables): key = `${estudiante_id}_${evaluacion_id}`
  const [cellValues, setCellValues] = useState<{ [key: string]: string }>({});

  // Snapshot inicial al cargar desde Supabase (para detectar celdas modificadas)
  const [initialCellValues, setInitialCellValues] = useState<{
    [key: string]: string;
  }>({});

  // Conjunto de claves de celdas modificadas por el usuario
  const [modifiedKeys, setModifiedKeys] = useState<Set<string>>(new Set());

  // Estados de la operación de guardado
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Estado para el botón "+ Agregar evaluación" e intentos de INSERT
  const [isAddingEval, setIsAddingEval] = useState<boolean>(false);
  const [rlsBlockedNotice, setRlsBlockedNotice] = useState<{
    message: string;
    code?: string;
  } | null>(null);

  // Carga evaluaciones y calificaciones para un curso_asignatura y período específico
  const loadEvaluationsAndGrades = useCallback(
    async (caId: number, currentStudents: DbStudent[], periodoNum: number) => {
      setIsLoadingGrades(true);
      setSaveErrorMessage(null);

      try {
        // Consultar evaluaciones para el período seleccionado
        const { data: evalsData, error: evalsErr } = await supabase
          .from("evaluaciones")
          .select("id, curso_asignatura_id, nombre, periodo, orden, fecha")
          .eq("curso_asignatura_id", caId)
          .eq("periodo", periodoNum)
          .order("orden", { ascending: true });

        if (evalsErr) {
          throw new Error(`Error al consultar evaluaciones: ${evalsErr.message}`);
        }

        const currentEvals = (evalsData as DbEvaluacion[]) || [];
        setEvaluations(currentEvals);

        const newDbMap: { [key: string]: DbCalificacion } = {};
        const newCellValues: { [key: string]: string } = {};

        if (currentStudents.length > 0 && currentEvals.length > 0) {
          const evalIds = currentEvals.map((e) => e.id);
          const studentIds = currentStudents.map((s) => s.id);

          const { data: califsData, error: califsErr } = await supabase
            .from("calificaciones")
            .select("id, estudiante_id, evaluacion_id, nota, created_at, updated_at")
            .in("evaluacion_id", evalIds)
            .in("estudiante_id", studentIds);

          if (califsErr) {
            throw new Error(`Error al consultar calificaciones en Supabase: ${califsErr.message}`);
          }

          if (califsData) {
            (califsData as DbCalificacion[]).forEach((row) => {
              const key = `${row.estudiante_id}_${row.evaluacion_id}`;
              newDbMap[key] = row;
            });
          }

          currentStudents.forEach((st) => {
            currentEvals.forEach((ev) => {
              const key = `${st.id}_${ev.id}`;
              const record = newDbMap[key];
              if (record && record.nota !== null && record.nota !== undefined) {
                newCellValues[key] = record.nota.toFixed(1).replace(".", ",");
              } else {
                newCellValues[key] = "";
              }
            });
          });
        }

        setDbCalificacionesMap(newDbMap);
        setCellValues(newCellValues);
        setInitialCellValues({ ...newCellValues });
        setModifiedKeys(new Set());
      } catch (err: unknown) {
        setLoadError(
          err instanceof Error
            ? err.message
            : "Error al recuperar evaluaciones y calificaciones del período."
        );
      } finally {
        setIsLoadingGrades(false);
      }
    },
    []
  );

  // Carga completa de datos desde Supabase (Estudiantes, Evaluaciones y Calificaciones)
  const fetchDataFromSupabase = useCallback(async () => {
    if (authLoading) return;

    setIsLoading(true);
    setLoadError(null);
    setSaveErrorMessage(null);
    setIsUnauthorized(false);

    try {
      if (!currentCourseId || !currentSubjectId) {
        throw new Error("Identificadores de curso o asignatura no especificados.");
      }

      // 1. Resolver el curso real dinámicamente desde Supabase
      let resolvedCourse: DbCurso | null = null;
      const numCourseId = parseInt(currentCourseId, 10);
      if (!isNaN(numCourseId) && numCourseId > 0) {
        const { data, error } = await supabase
          .from("cursos")
          .select("id, nombre, nivel, letra, anio, profesor_jefe_id")
          .eq("id", numCourseId)
          .maybeSingle();

        if (error) {
          throw new Error(`Error al consultar curso en Supabase: ${error.message}`);
        }
        if (data) {
          resolvedCourse = data as DbCurso;
        }
      }

      if (!resolvedCourse) {
        const { data: allCursos, error: allCursosErr } = await supabase
          .from("cursos")
          .select("id, nombre, nivel, letra, anio, profesor_jefe_id");

        if (allCursosErr) {
          throw new Error(`Error al consultar cursos en Supabase: ${allCursosErr.message}`);
        }

        if (allCursos && allCursos.length > 0) {
          resolvedCourse = (allCursos.find(
            (c) =>
              slugify(c.nombre) === currentCourseId.toLowerCase() ||
              c.nombre.toLowerCase() === currentCourseId.toLowerCase()
          ) as DbCurso) || null;
        }
      }

      if (!resolvedCourse) {
        throw new Error(`No se encontró el curso correspondiente a "${currentCourseId}" en Supabase.`);
      }

      setCursoData(resolvedCourse);

      // 2. Cargar períodos del año lectivo del curso desde Supabase (Requisito 1)
      const courseYear = resolvedCourse.anio || 2026;
      const { data: periodosData, error: periodosErr } = await supabase
        .from("periodos")
        .select("id, numero, nombre, anio, activo, cerrado, fecha_inicio, fecha_fin")
        .eq("anio", courseYear)
        .order("numero", { ascending: true });

      if (periodosErr) {
        throw new Error(`Error al consultar períodos en Supabase: ${periodosErr.message}`);
      }

      const loadedPeriodos = (periodosData as DbPeriodo[]) || [];
      setPeriodos(loadedPeriodos);

      // Determinar período inicial (Requisito 2):
      // - Seleccionar automáticamente el período con activo = true
      // - Si no existe activo, usar el primero disponible
      // - NO usar fallback fijo a 2
      let initialPeriodoNumero: number | null = null;
      if (loadedPeriodos.length > 0) {
        const activePeriod = loadedPeriodos.find((p) => p.activo === true);
        initialPeriodoNumero = activePeriod ? activePeriod.numero : loadedPeriodos[0].numero;
      }
      setSelectedPeriodoNumero(initialPeriodoNumero);

      // 3. Resolver la relación curso_asignatura correspondiente al curso y asignatura
      const { data: caList, error: caError } = await supabase
        .from("curso_asignaturas")
        .select(`
          id,
          curso_id,
          asignatura_id,
          docente_id,
          cursos (id, nombre, nivel, letra, anio),
          asignaturas (id, nombre, activo),
          docentes (id, nombres, apellidos, email, activo)
        `)
        .eq("curso_id", resolvedCourse.id);

      if (caError) {
        throw new Error(`Error en curso_asignaturas: ${caError.message}`);
      }

      if (!caList || caList.length === 0) {
        throw new Error(`El curso "${resolvedCourse.nombre}" no tiene asignaturas vinculadas en Supabase.`);
      }

      const typedCaList = (caList || []) as unknown as DbCursoAsignatura[];

      // Buscar la relación por:
      // a) asignatura_id numérico
      // b) curso_asignaturas.id numérico
      // c) slug o coincidencia de nombre de asignatura
      const matchedCa = typedCaList.find((ca) => {
        if (ca.asignatura_id?.toString() === currentSubjectId) return true;
        if (ca.id?.toString() === currentSubjectId) return true;
        if (ca.asignaturas?.nombre) {
          const slug = slugify(ca.asignaturas.nombre);
          if (slug === currentSubjectId.toLowerCase() || slug.startsWith(currentSubjectId.toLowerCase())) return true;
          if (ca.asignaturas.nombre.toLowerCase().includes(currentSubjectId.toLowerCase())) return true;
        }
        return false;
      });

      if (!matchedCa) {
        throw new Error(`No se encontró la asignatura "${currentSubjectId}" vinculada al curso "${resolvedCourse.nombre}" en Supabase.`);
      }

      // Validación de autorización docente:
      // Si es docente, debe coincidir con su docente_id asignado en curso_asignaturas
      // Si es UTP o directivo, pasa libremente
      if (profile?.rol === "docente") {
        if (!profile.docente_id || matchedCa.docente_id !== profile.docente_id) {
          setIsUnauthorized(true);
          setIsLoading(false);
          return;
        }
      }

      const caId = matchedCa.id;
      setCursoAsignaturaId(caId);
      setAsignaturaData(matchedCa.asignaturas);
      setDocenteData(matchedCa.docentes || null);

      // 4. Obtener nómina de estudiantes del curso resuelto ordenados por numero_lista
      const { data: studentsData, error: studentsErr } = await supabase
        .from("estudiantes")
        .select("id, numero_lista, nombres, apellidos, curso_id")
        .eq("curso_id", resolvedCourse.id)
        .order("numero_lista", { ascending: true });

      if (studentsErr) {
        throw new Error(`Error al consultar estudiantes: ${studentsErr.message}`);
      }

      const currentStudents = (studentsData as DbStudent[]) || [];
      setStudents(currentStudents);

      // 5. Cargar evaluaciones y calificaciones para el período inicial resuelto
      if (initialPeriodoNumero !== null) {
        await loadEvaluationsAndGrades(caId, currentStudents, initialPeriodoNumero);
      } else {
        setEvaluations([]);
        setDbCalificacionesMap({});
        setCellValues({});
        setInitialCellValues({});
        setModifiedKeys(new Set());
      }
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Error inesperado al recuperar los datos desde Supabase."
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentCourseId, currentSubjectId, profile, authLoading, loadEvaluationsAndGrades]);

  useEffect(() => {
    if (!authLoading) {
      fetchDataFromSupabase();
    }
  }, [fetchDataFromSupabase, authLoading]);

  // Actualizar una celda específica en memoria sin realizar peticiones a la BD por cada pulsación
  const updateCellValue = (
    studentId: number,
    evalId: number,
    newValue: string
  ) => {
    const key = `${studentId}_${evalId}`;
    setCellValues((prev) => ({
      ...prev,
      [key]: newValue,
    }));

    // Determinar si la celda difiere de su valor inicial guardado en Supabase
    setModifiedKeys((prev) => {
      const next = new Set(prev);
      const initialVal = initialCellValues[key] ?? "";
      if (newValue !== initialVal) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });

    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
  };

  // Manejar el cambio de texto al tipear en una celda
  const handleGradeChange = (
    studentId: number,
    evalId: number,
    inputValue: string
  ) => {
    if (inputValue.trim() === "") {
      updateCellValue(studentId, evalId, "");
      return;
    }

    let sanitized = inputValue.replace(/[^0-9.,]/g, "");
    const parts = sanitized.split(/[,.]/);
    if (parts.length > 2) {
      sanitized = `${parts[0]},${parts.slice(1).join("")}`;
    }

    // Si el usuario escribe dos dígitos continuos (ej: "65"), auto-formatear a "6,5"
    if (/^[1-7][0-9]$/.test(sanitized)) {
      sanitized = `${sanitized[0]},${sanitized[1]}`;
    }

    updateCellValue(studentId, evalId, sanitized);
  };

  // Al salir de la celda (blur), normalizar formato decimal (ej: "6" -> "6,0" o "6.5" -> "6,5")
  const handleGradeBlur = (studentId: number, evalId: number) => {
    const key = `${studentId}_${evalId}`;
    const currentVal = cellValues[key] ?? "";
    if (currentVal.trim() === "") return;

    const normalized = currentVal.trim().replace(",", ".");
    const num = parseFloat(normalized);

    if (!isNaN(num) && num >= 1.0 && num <= 7.0) {
      const formatted = num.toFixed(1).replace(".", ",");
      updateCellValue(studentId, evalId, formatted);
    }
  };

  // Al presionar Enter, avanzar a la misma columna del estudiante siguiente
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    evalIndex: number
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nextRowIndex = rowIndex + 1;
      if (nextRowIndex < students.length) {
        const nextInputId = `grade-cell-${nextRowIndex}-${evalIndex}`;
        const nextInput = document.getElementById(nextInputId) as HTMLInputElement | null;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }
  };

  // Guardar cambios: persiste ÚNICAMENTE las calificaciones modificadas en Supabase
  const handleSaveChanges = async () => {
    if (modifiedKeys.size === 0 || isSaving || isPeriodoCerrado) return;

    // 1. Validar que no existan calificaciones no vacías fuera de rango (1,0 a 7,0)
    for (const key of Array.from(modifiedKeys)) {
      const val = cellValues[key] || "";
      if (val.trim() !== "" && parseGrade(val) === null) {
        setSaveErrorMessage(
          "Existen calificaciones con formato o valor inválido (deben estar entre 1,0 y 7,0)."
        );
        return;
      }
    }

    setIsSaving(true);
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);

    // 2. Clasificar las operaciones requeridas (INSERT vs UPDATE)
    const inserts: { estudiante_id: number; evaluacion_id: number; nota: number | null }[] = [];
    const updates: { id: number; estudiante_id: number; evaluacion_id: number; nota: number | null }[] = [];

    for (const key of Array.from(modifiedKeys)) {
      const [stIdStr, evIdStr] = key.split("_");
      const stId = parseInt(stIdStr, 10);
      const evId = parseInt(evIdStr, 10);
      const strVal = cellValues[key] || "";
      const numGrade = parseGrade(strVal);

      const existingRecord = dbCalificacionesMap[key];

      if (existingRecord) {
        // Ya existe registro en Supabase -> actualizar mediante UPDATE
        updates.push({
          id: existingRecord.id,
          estudiante_id: stId,
          evaluacion_id: evId,
          nota: numGrade,
        });
      } else {
        // No existe en Supabase -> si contiene nota, registrar mediante INSERT
        if (numGrade !== null) {
          inserts.push({
            estudiante_id: stId,
            evaluacion_id: evId,
            nota: numGrade,
          });
        }
      }
    }

    try {
      const updatedDbMap = { ...dbCalificacionesMap };
      let insertCount = 0;
      let updateCount = 0;

      // 3. Ejecutar INSERTS si hay combinaciones nuevas
      if (inserts.length > 0) {
        const { data: insertedData, error: insErr } = await supabase
          .from("calificaciones")
          .insert(inserts)
          .select();

        if (insErr) {
          throw new Error(`Error en INSERT de calificaciones: ${insErr.message}`);
        }

        // Si Supabase devuelve menos registros de los solicitados (bloqueo por RLS)
        if (!insertedData || insertedData.length !== inserts.length) {
          const confirmedCount = insertedData?.length || 0;
          throw new Error(
            `Supabase no confirmó todas las inserciones solicitadas (${confirmedCount} de ${inserts.length} confirmadas). La operación fue rechazada o bloqueada por políticas RLS.`
          );
        }

        insertCount = insertedData.length;
        (insertedData as DbCalificacion[]).forEach((row) => {
          const k = `${row.estudiante_id}_${row.evaluacion_id}`;
          updatedDbMap[k] = row;
        });
      }

      // 4. Ejecutar UPDATES para los registros ya existentes
      if (updates.length > 0) {
        for (const item of updates) {
          const { data: updatedData, error: updErr } = await supabase
            .from("calificaciones")
            .update({
              nota: item.nota,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id)
            .select();

          if (updErr) {
            throw new Error(`Error en UPDATE de calificación (ID #${item.id}): ${updErr.message}`);
          }

          // Si Supabase devuelve un array vacío, el registro no se actualizó (bloqueo por RLS o ID no encontrado)
          if (!updatedData || updatedData.length === 0) {
            throw new Error(
              `Supabase no confirmó la actualización de la calificación (ID #${item.id}). La operación fue bloqueada o rechazada por políticas RLS.`
            );
          }

          const updatedRow = updatedData[0] as DbCalificacion;
          const k = `${updatedRow.estudiante_id}_${updatedRow.evaluacion_id}`;
          updatedDbMap[k] = updatedRow;
          updateCount++;
        }
      }

      // Verificar que se hayan confirmado exactamente todas las operaciones solicitadas
      if (insertCount !== inserts.length || updateCount !== updates.length) {
        throw new Error(
          `No se confirmaron todas las operaciones solicitadas en Supabase (Insertadas: ${insertCount}/${inserts.length}, Actualizadas: ${updateCount}/${updates.length}).`
        );
      }

      // 5. Actualizar el mapa local con los registros efectivamente persistidos en Supabase
      setDbCalificacionesMap(updatedDbMap);
      setInitialCellValues({ ...cellValues });
      setModifiedKeys(new Set());

      // Sincronizar context en memoria por compatibilidad de visualización secundaria
      const legacyGradesMatrix: { [key: number]: string[] } = {};
      students.forEach((st) => {
        legacyGradesMatrix[st.numero_lista] = evaluations.map(
          (ev) => cellValues[`${st.id}_${ev.id}`] || ""
        );
      });
      saveSubjectData(subject?.id || currentSubjectId, legacyGradesMatrix, evaluations.map((e) => e.nombre));

      // 6. Mensaje de éxito descriptivo únicamente tras confirmación total
      const details: string[] = [];
      if (insertCount > 0) details.push(`${insertCount} calificación(es) insertada(s)`);
      if (updateCount > 0) details.push(`${updateCount} calificación(es) actualizada(s)`);
      const detailsText = details.length > 0 ? ` (${details.join(", ")})` : "";

      setSaveSuccessMessage(`Cambios guardados exitosamente en Supabase${detailsText}.`);
      setTimeout(() => {
        setSaveSuccessMessage(null);
      }, 5000);
    } catch (err: unknown) {
      // Si Supabase produce un error o bloqueo RLS:
      // - NO se limpia modifiedKeys
      // - NO se limpia initialCellValues
      // - NO se actualiza dbCalificacionesMap
      // - Los valores editados en cellValues permanecen en pantalla
      setSaveErrorMessage(
        err instanceof Error
          ? err.message
          : "Error inesperado al guardar las calificaciones en Supabase."
      );
      setSaveSuccessMessage(null);
    } finally {
      setIsSaving(false);
    }
  };

  // Cambio de período académico (Requisito 3 y 4)
  const handleSelectPeriodo = (periodoNum: number) => {
    if (periodoNum === selectedPeriodoNumero) return;

    if (hasUnsavedChanges) {
      const confirmSwitch = window.confirm(
        "Tiene calificaciones modificadas sin guardar en este período. Si cambia de período, los cambios no guardados se perderán.\n\n¿Desea continuar y cambiar de período?"
      );
      if (!confirmSwitch) return;
    }

    setSelectedPeriodoNumero(periodoNum);
    if (cursoAsignaturaId) {
      loadEvaluationsAndGrades(cursoAsignaturaId, students, periodoNum);
    }
  };

  // Requisito sobre "+ Agregar evaluación": utiliza el período seleccionado y valida período abierto
  const handleAddEvaluation = async () => {
    if (!cursoAsignaturaId || selectedPeriodoNumero === null || isPeriodoCerrado) return;

    setIsAddingEval(true);
    setRlsBlockedNotice(null);

    const nextOrden = evaluations.length + 1;
    const newEvalName = `Nota ${nextOrden}`;

    try {
      const { data, error } = await supabase
        .from("evaluaciones")
        .insert({
          curso_asignatura_id: cursoAsignaturaId,
          nombre: newEvalName,
          periodo: selectedPeriodoNumero,
          orden: nextOrden,
        })
        .select();

      if (error) {
        console.warn("INSERT bloqueado por RLS en tabla evaluaciones:", error);
        setRlsBlockedNotice({
          message:
            "No se pudo agregar la evaluación en Supabase: la tabla 'evaluaciones' tiene RLS activo y bloquea la sentencia INSERT para el rol anónimo. Se requiere crear una política INSERT en Supabase.",
          code: error.code,
        });
        return;
      }

      if (data && data.length > 0) {
        const newInsertedEval = data[0] as DbEvaluacion;
        setEvaluations((prev) => [...prev, newInsertedEval]);
        setSaveSuccessMessage(`Evaluación "${newEvalName}" agregada exitosamente en Supabase para ${currentPeriodo?.nombre || "este período"}.`);
      }
    } catch (err: unknown) {
      setRlsBlockedNotice({
        message:
          err instanceof Error
            ? `Error inesperado: ${err.message}`
            : "Error de red al intentar insertar en Supabase.",
      });
    } finally {
      setIsAddingEval(false);
    }
  };

  // Estado de cambios pendientes
  const hasUnsavedChanges = modifiedKeys.size > 0;

  // Variables dinámicas para interfaz de usuario resueltas desde Supabase
  const courseTitle = cursoData?.nombre || course?.fullTitle || currentCourseId || "Curso";
  const subjectDisplayName = asignaturaData?.nombre || subject?.name || currentSubjectId || "Asignatura";
  const teacherDisplayName = docenteData
    ? `Prof. ${docenteData.nombres} ${docenteData.apellidos}`.trim()
    : subject?.teacher || "Sin docente asignado";
  const roomName = course?.room || "101";
  const schoolYear = cursoData?.anio?.toString() || course?.schoolYear || "2026";
  const periodName = currentPeriodo ? currentPeriodo.nombre : periodos.length === 0 ? "Sin períodos" : "Seleccione período";

  // Calcular promedio general del curso en la asignatura
  const studentAverages = students
    .map((st) => {
      const studentGradesList = evaluations.map(
        (ev) => cellValues[`${st.id}_${ev.id}`] || ""
      );
      return formatAverage(studentGradesList).value;
    })
    .filter((v): v is number => v !== null);

  const courseSubjectAverage =
    studentAverages.length > 0
      ? (
          studentAverages.reduce((a, b) => a + b, 0) / studentAverages.length
        ).toFixed(1).replace(".", ",")
      : "—";

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

        {/* Notificación flotante de guardado exitoso en Supabase */}
        {saveSuccessMessage && (
          <div className="fixed top-20 right-4 z-50 max-w-md bg-emerald-900 text-white px-4 py-3 rounded-xl shadow-lg border border-emerald-700 flex items-center gap-3 transition-all animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center shrink-0 text-white font-bold">
              ✓
            </div>
            <div className="text-xs">
              <p className="font-semibold text-emerald-200">Supabase Sincronizado</p>
              <p className="text-emerald-100">{saveSuccessMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setSaveSuccessMessage(null)}
              className="ml-auto text-emerald-300 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Notificación cuando RLS bloquea INSERT en evaluaciones */}
        {rlsBlockedNotice && (
          <div className="fixed top-20 right-4 z-50 max-w-lg bg-amber-950 text-white px-5 py-4 rounded-xl shadow-2xl border border-amber-600 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-full bg-amber-800 border border-amber-500 flex items-center justify-center shrink-0 text-amber-200 font-bold">
              !
            </div>
            <div className="text-xs space-y-1">
              <p className="font-bold text-amber-200">
                Bloqueo de RLS en Supabase ({rlsBlockedNotice.code || "Permiso denegado"})
              </p>
              <p className="text-amber-100 leading-relaxed">
                {rlsBlockedNotice.message}
              </p>
              <p className="text-[11px] text-amber-300 pt-1">
                La evaluación <strong>no fue creada en memoria</strong> cumpliendo con la directriz del sistema.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRlsBlockedNotice(null)}
              className="ml-auto text-amber-300 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Vista Bloqueada por Autorización si el usuario no tiene permisos sobre la asignatura */}
        {isUnauthorized ? (
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-3xl w-full mx-auto flex flex-col justify-center items-center">
            <div className="w-full bg-white rounded-2xl border border-rose-200/90 p-8 sm:p-12 shadow-xs text-center space-y-5 my-auto">
              <div className="w-16 h-16 rounded-full bg-rose-100 border border-rose-200 mx-auto flex items-center justify-center text-rose-600">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <div className="space-y-2">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-800 border border-rose-200">
                  Acceso Restringido
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  No tienes autorización para acceder a esta asignatura.
                </h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Esta asignatura no corresponde a tu perfil docente. Solo puedes registrar calificaciones en las asignaturas asignadas a tu cargo.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href={`/cursos/${currentCourseId}`}
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
                  {profile?.rol === "docente" ? "Panel Docente" : "Panel UTP"}
                </Link>
                <span>/</span>
                <Link
                  href={`/cursos/${currentCourseId}`}
                  className="hover:text-blue-900 font-medium transition-colors"
                >
                  {courseTitle}
                </Link>
                <span>/</span>
                <span className="text-slate-900 font-semibold">{subjectDisplayName}</span>
              </div>

            <Link
              href={`/cursos/${currentCourseId}`}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-semibold shadow-2xs transition-colors"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver al curso</span>
            </Link>
          </nav>

          {/* Tarjeta de encabezado con los datos del curso y asignatura */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-900 text-white">
                    {courseTitle}
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                    Asignatura Oficial
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                      isPeriodoCerrado
                        ? "bg-rose-50 text-rose-800 border-rose-300"
                        : periodos.length === 0
                        ? "bg-slate-100 text-slate-600 border-slate-300"
                        : "bg-emerald-50 text-emerald-800 border-emerald-300"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isPeriodoCerrado
                          ? "bg-rose-500"
                          : periodos.length === 0
                          ? "bg-slate-400"
                          : "bg-emerald-500 animate-pulse"
                      }`}
                    ></span>
                    Estado: {isPeriodoCerrado ? "Período cerrado" : periodos.length === 0 ? "Sin períodos" : "Período abierto"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-900 border border-emerald-200">
                    Calificaciones: Supabase
                  </span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {subjectDisplayName}
                </h2>

                <p className="text-xs sm:text-sm text-slate-600">
                  Docente a cargo: <strong className="text-slate-800 font-semibold">{teacherDisplayName}</strong> · Sala {roomName}
                </p>
              </div>

              {/* Parámetros institucionales */}
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
                    {periodName}
                  </span>
                </div>

                <div className="bg-blue-50/70 px-4 py-2.5 rounded-xl border border-blue-200 text-center min-w-[120px]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 block">
                    Promedio Curso
                  </span>
                  <span className="text-base font-extrabold text-blue-950">
                    {courseSubjectAverage}
                  </span>
                </div>
              </div>
            </div>

            {/* SELECTOR VISUAL DE PERÍODOS ACADÉMICOS (Requisito 3) */}
            {periodos.length > 0 ? (
              <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">
                    Período:
                  </span>
                  {periodos.map((p) => {
                    const isSelected = p.numero === selectedPeriodoNumero;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPeriodo(p.numero)}
                        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                          isSelected
                            ? "bg-[#0f2942] text-white border-[#0f2942] shadow-sm ring-2 ring-blue-900/20"
                            : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300 hover:border-slate-400"
                        }`}
                      >
                        <span>{p.nombre}</span>

                        {/* Indicador Período actual (activo = true) */}
                        {p.activo && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                              isSelected
                                ? "bg-blue-600 text-white"
                                : "bg-blue-100 text-blue-900"
                            }`}
                            title="Período lectivo en curso"
                          >
                            Actual
                          </span>
                        )}

                        {/* Indicador Abierto / Cerrado */}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            p.cerrado
                              ? isSelected
                                ? "bg-rose-950 text-rose-200 border border-rose-700"
                                : "bg-rose-100 text-rose-800 border border-rose-200"
                              : isSelected
                              ? "bg-emerald-900 text-emerald-200 border border-emerald-700"
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          {p.cerrado ? "Cerrado" : "Abierto"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {currentPeriodo && (
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    {currentPeriodo.cerrado ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        Modo solo lectura
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Habilitado para ingreso
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              !isLoading && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">⚠️</span>
                      <div>
                        <p className="font-bold text-amber-900 text-sm">
                          No existen períodos académicos configurados para este año.
                        </p>
                        <p className="text-amber-700 mt-0.5">
                          No es posible crear evaluaciones ni ingresar calificaciones para el año escolar {schoolYear}.
                        </p>
                      </div>
                    </div>
                    {profile?.rol === "utp" && (
                      <Link
                        href="/periodos"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold transition-colors shrink-0"
                      >
                        <span>Configurar períodos</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    )}
                  </div>
                </div>
              )
            )}

            {/* Barra de herramientas de acciones: Agregar evaluación, Guardar cambios y Estado */}
            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {hasUnsavedChanges ? (
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                    Existen cambios sin guardar ({modifiedKeys.size} calificación{modifiedKeys.size > 1 ? "es" : ""})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Calificaciones al día
                  </span>
                )}
                <span className="text-xs text-slate-500 hidden md:inline">
                  {isPeriodoCerrado
                    ? "(Período cerrado · Las calificaciones se encuentran bloqueadas para edición)"
                    : "(Escala 1,0 a 7,0 · Haga clic para editar · Presione Enter para avanzar)"}
                </span>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center gap-3">
                {/* Botón "+ Agregar evaluación" */}
                <button
                  type="button"
                  onClick={handleAddEvaluation}
                  disabled={isAddingEval || isLoading || isLoadingGrades || isPeriodoCerrado || periodos.length === 0}
                  title={
                    isPeriodoCerrado
                      ? "Período cerrado — No se pueden agregar evaluaciones"
                      : periodos.length === 0
                      ? "No existen períodos configurados"
                      : undefined
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-900 ${
                    isPeriodoCerrado || periodos.length === 0
                      ? "border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60"
                      : "border-blue-900 bg-white hover:bg-blue-50 text-blue-900 cursor-pointer"
                  }`}
                >
                  {isAddingEval ? (
                    <span className="inline-block w-4 h-4 border-2 border-blue-900 border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                  <span>+ Agregar evaluación</span>
                </button>

                {/* Botón "Guardar cambios" */}
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={!hasUnsavedChanges || isSaving || isPeriodoCerrado}
                  title={isPeriodoCerrado ? "El período se encuentra cerrado en modo solo lectura" : undefined}
                  className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    !isPeriodoCerrado && hasUnsavedChanges && !isSaving
                      ? "bg-blue-900 hover:bg-blue-800 text-white focus:ring-blue-900 shadow-blue-950/20 cursor-pointer"
                      : "bg-slate-200 text-slate-500 cursor-default opacity-80"
                  }`}
                >
                  {isSaving ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Guardando en Supabase...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      <span>Guardar cambios</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Banner de error al guardar en Supabase (permite reintentar) */}
          {saveErrorMessage && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start justify-between gap-3 text-rose-900">
              <div className="space-y-1 text-xs">
                <p className="font-bold text-sm">Error al persistir calificaciones en Supabase</p>
                <p className="text-rose-700">{saveErrorMessage}</p>
                <p className="text-[11px] text-rose-600">
                  Sus cambios locales no se han perdido. Puede corregir o presionar &quot;Guardar cambios&quot; nuevamente para reintentar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaveErrorMessage(null)}
                className="text-rose-500 hover:text-rose-800 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Banner de aviso visible de Período Cerrado (Requisito 6) */}
          {isPeriodoCerrado && (
            <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl flex items-start gap-3.5 text-amber-950 shadow-xs">
              <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center shrink-0 font-bold text-sm">
                🔒
              </div>
              <div className="text-xs space-y-1">
                <p className="font-bold text-sm text-amber-900">
                  Período cerrado — Las calificaciones se encuentran en modo solo lectura.
                </p>
                <p className="text-amber-800 leading-relaxed">
                  El {currentPeriodo?.nombre || "período"} fue cerrado administrativamente. No se permite agregar nuevas evaluaciones ni modificar calificaciones existentes.
                  {profile?.rol === "utp" && (
                    <span className="block mt-1 text-blue-900 font-semibold">
                      Como UTP, si necesita rectificar notas debe reabrir el período desde{" "}
                      <Link href="/periodos" className="underline hover:text-blue-950 font-bold">
                        Administración de Períodos
                      </Link>
                      .
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* TABLA DE CALIFICACIONES PERSISTIDAS EN SUPABASE */}
          <section className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
            {/* Estado de Carga Inicial */}
            {isLoading && (
              <div className="p-10 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-900 animate-spin">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-600">
                  Cargando calificaciones y evaluaciones desde Supabase...
                </p>
              </div>
            )}

            {/* Estado de Carga al cambiar de período */}
            {!isLoading && isLoadingGrades && (
              <div className="p-10 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-900 animate-spin">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-600">
                  Cargando calificaciones de {currentPeriodo?.nombre || "este período"}...
                </p>
              </div>
            )}

            {/* Estado de Error de Carga Principal */}
            {!isLoading && loadError && (
              <div className="bg-rose-50 border border-rose-200 p-6 text-center text-rose-900 m-4 rounded-xl">
                <p className="font-bold text-sm">Error al cargar datos desde Supabase</p>
                <p className="text-xs text-rose-700 mt-1">{loadError}</p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={fetchDataFromSupabase}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white rounded-lg cursor-pointer"
                  >
                    Reintentar
                  </button>
                  <Link
                    href={`/cursos/${currentCourseId}`}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg"
                  >
                    Volver al curso
                  </Link>
                </div>
              </div>
            )}

            {/* Estado cuando no existen períodos configurados para el año (Requisito 9) */}
            {!isLoading && !loadError && periodos.length === 0 && (
              <div className="p-12 text-center text-slate-500 space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto text-xl font-bold">
                  📅
                </div>
                <p className="font-bold text-base text-slate-800">
                  No existen períodos académicos configurados para este año.
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No se pueden crear evaluaciones ni ingresar calificaciones mientras no existan períodos definidos en el sistema para el año {schoolYear}.
                </p>
                {profile?.rol === "utp" && (
                  <div className="pt-2">
                    <Link
                      href="/periodos"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-colors"
                    >
                      <span>Ir a Administrar Períodos</span>
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Estado cuando no existen evaluaciones para el período seleccionado */}
            {!isLoading && !isLoadingGrades && !loadError && periodos.length > 0 && evaluations.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                <p className="font-bold text-sm text-slate-800">
                  No hay evaluaciones registradas para este curso en {currentPeriodo?.nombre || "el período seleccionado"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {isPeriodoCerrado
                    ? "El período está cerrado y no contiene evaluaciones registradas."
                    : 'La tabla "evaluaciones" en Supabase no contiene registros para este período. Puede presionar "+ Agregar evaluación" para comenzar.'}
                </p>
              </div>
            )}

            {/* Tabla generada dinámicamente: Estudiantes x Evaluaciones (desde Supabase) */}
            {!isLoading && !loadError && evaluations.length > 0 && students.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-[#0f2942] text-white text-xs font-semibold uppercase tracking-wider select-none">
                    <tr>
                      <th scope="col" className="px-3 py-3.5 w-14 text-center border-r border-[#162a45]">
                        N.º
                      </th>
                      <th scope="col" className="px-5 py-3.5 min-w-[240px] border-r border-[#162a45]">
                        Estudiante
                      </th>
                      {evaluations.map((ev) => (
                        <th
                          key={ev.id}
                          scope="col"
                          className="px-3 py-3.5 w-24 text-center border-r border-[#162a45] bg-[#0b2138]"
                        >
                          <div className="flex flex-col items-center">
                            <span>{ev.nombre}</span>
                            <span className="text-[10px] font-normal text-blue-200 lowercase mt-0.5">
                              ID #{ev.id} · orden {ev.orden}
                            </span>
                          </div>
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-3.5 w-24 text-center bg-[#081729]">
                        <div className="flex flex-col items-center">
                          <span className="text-blue-200">Promedio</span>
                          <span className="text-[10px] font-normal text-slate-300 lowercase mt-0.5">
                            1 dec.
                          </span>
                        </div>
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {students.map((student, rowIndex) => {
                      // Lista de calificaciones del estudiante para calcular promedio
                      const studentGradesList = evaluations.map(
                        (ev) => cellValues[`${student.id}_${ev.id}`] || ""
                      );
                      const average = formatAverage(studentGradesList);
                      const isFailing = average.value !== null && average.value < 4.0;
                      const studentFullName = `${student.apellidos}, ${student.nombres}`;

                      return (
                        <tr
                          key={student.id}
                          className="hover:bg-blue-50/30 transition-colors"
                        >
                          {/* N.º de lista */}
                          <td className="px-3 py-2.5 text-center font-bold text-xs text-slate-500 bg-slate-50/50 border-r border-slate-200">
                            {student.numero_lista}
                          </td>

                          {/* Nombre del estudiante */}
                          <td className="px-5 py-2.5 border-r border-slate-200">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700 shrink-0">
                                {student.nombres.charAt(0)}
                              </div>
                              <span className="font-semibold text-slate-900 text-xs sm:text-sm truncate">
                                {studentFullName}
                              </span>
                            </div>
                          </td>

                          {/* Celdas de Calificaciones vinculadas por estudiante.id y ev.id */}
                          {evaluations.map((ev, evalIndex) => {
                            const cellKey = `${student.id}_${ev.id}`;
                            const currentVal = cellValues[cellKey] ?? "";
                            const numericVal = parseGrade(currentVal);
                            const isInvalid = currentVal.trim() !== "" && numericVal === null;
                            const isRedGrade = numericVal !== null && numericVal < 4.0;
                            const isModified = modifiedKeys.has(cellKey);

                            return (
                              <td
                                key={ev.id}
                                className={`px-2 py-1.5 text-center border-r border-slate-200 ${
                                  isModified ? "bg-amber-50/50" : ""
                                }`}
                              >
                                <input
                                  id={`grade-cell-${rowIndex}-${evalIndex}`}
                                  type="text"
                                  inputMode="decimal"
                                  disabled={isPeriodoCerrado}
                                  readOnly={isPeriodoCerrado}
                                  value={currentVal}
                                  onChange={(e) =>
                                    !isPeriodoCerrado &&
                                    handleGradeChange(
                                      student.id,
                                      ev.id,
                                      e.target.value
                                    )
                                  }
                                  onBlur={() => !isPeriodoCerrado && handleGradeBlur(student.id, ev.id)}
                                  onFocus={(e) => !isPeriodoCerrado && e.target.select()}
                                  onClick={(e) => !isPeriodoCerrado && e.currentTarget.select()}
                                  onKeyDown={(e) =>
                                    handleKeyDown(e, rowIndex, evalIndex)
                                  }
                                  placeholder="—"
                                  maxLength={5}
                                  className={`w-16 h-9 mx-auto text-center font-bold text-sm rounded-md border transition-all ${
                                    isPeriodoCerrado
                                      ? "bg-slate-100 text-slate-700 border-slate-200 cursor-not-allowed select-none opacity-90"
                                      : isInvalid
                                      ? "border-rose-500 bg-rose-50 text-rose-700 ring-rose-500 cursor-text focus:outline-none focus:ring-2"
                                      : isRedGrade
                                      ? "text-rose-600 bg-rose-50/60 border-rose-200 focus:border-rose-400 focus:ring-rose-200 cursor-text focus:outline-none focus:ring-2"
                                      : isModified
                                      ? "text-amber-950 bg-amber-50/80 border-amber-300 focus:border-amber-500 focus:ring-amber-200 cursor-text focus:outline-none focus:ring-2"
                                      : currentVal !== ""
                                      ? "text-blue-950 bg-white border-slate-300 focus:border-blue-900 focus:ring-blue-200 cursor-text focus:outline-none focus:ring-2"
                                      : "text-slate-400 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-900 focus:ring-blue-200 cursor-text focus:outline-none focus:ring-2"
                                  }`}
                                  title={
                                    isPeriodoCerrado
                                      ? `Período cerrado (solo lectura) · Estudiante: ${studentFullName} · Evaluación: ${ev.nombre}`
                                      : `Estudiante: ${studentFullName} · Evaluación: ${ev.nombre} (ID #${ev.id}). Ingrese nota entre 1,0 y 7,0.`
                                  }
                                />
                              </td>
                            );
                          })}

                          {/* Columna Promedio calculada automáticamente */}
                          <td className="px-3 py-2 text-center bg-slate-50/80">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-md text-xs sm:text-sm font-extrabold ${
                                isFailing
                                  ? "text-rose-700 bg-rose-100 border border-rose-200"
                                  : average.value !== null
                                  ? "text-blue-900 bg-blue-100/80 border border-blue-200"
                                  : "text-slate-400"
                              }`}
                            >
                              {average.text}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
        )}
      </div>
    </div>
  );
}
