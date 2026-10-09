"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { DbStudent } from "@/types/dashboard";
import {
  parseSigeHtml,
  SigeCourseGroup,
  SigeParsedStudent,
  formatRutDisplay,
  getCanonicalLevel,
  areCoursesEquivalent,
} from "@/utils/sigeParser";

interface SigeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  cursoId: number;
  cursoNombre: string;
  cursoNivel?: string;
  cursoLetra?: string;
  cursoAnio: number;
  existingStudents: DbStudent[];
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export type StudentStatus = "new" | "exists" | "error";

export interface StudentValidationInfo {
  student: SigeParsedStudent;
  status: StudentStatus;
  statusMessage: string;
  warnings: string[];
  errors: string[];
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function SigeImportModal({
  isOpen,
  onClose,
  cursoId,
  cursoNombre,
  cursoNivel,
  cursoLetra,
  cursoAnio,
  existingStudents,
  onSuccess,
  onError,
}: SigeImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isReadingFile, setIsReadingFile] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Grupos de cursos detectados en el archivo SIGE
  const [detectedGroups, setDetectedGroups] = useState<SigeCourseGroup[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>("");

  // Estudiantes del curso con cruce de información en Supabase
  const [crossCourseData, setCrossCourseData] = useState<
    Map<number, { cursoNombre: string; anio: number }>
  >(new Map());
  const [isCheckingCrossCourse, setIsCheckingCrossCourse] = useState<boolean>(false);

  // Confirmación explícita si el curso detectado difiere del curso actual
  const [isCourseMismatchConfirmed, setIsCourseMismatchConfirmed] = useState<boolean>(false);

  // Estado de envío a Supabase
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Reset al abrir/cerrar
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setIsReadingFile(false);
      setParseError(null);
      setDetectedGroups([]);
      setSelectedGroupKey("");
      setCrossCourseData(new Map());
      setIsCheckingCrossCourse(false);
      setIsCourseMismatchConfirmed(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Manejar selección y lectura del archivo .xls
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xls") && !file.name.toLowerCase().endsWith(".html")) {
      setParseError("Por favor seleccione un archivo con extensión .xls descargado desde SIGE.");
      return;
    }

    setSelectedFile(file);
    setIsReadingFile(true);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setParseError("Este archivo SIGE no pudo ser leído con el formato actual. No se realizaron cambios.");
        setIsReadingFile(false);
        return;
      }

      const parseResult = parseSigeHtml(text);
      setIsReadingFile(false);

      if (!parseResult.success || parseResult.groups.length === 0) {
        setParseError(
          parseResult.error ||
            "Este archivo SIGE no pudo ser leído con el formato actual. No se realizaron cambios."
        );
        setDetectedGroups([]);
        setSelectedGroupKey("");
        return;
      }

      setDetectedGroups(parseResult.groups);

      // Intentar auto-seleccionar el grupo canónicamente equivalente al curso actual
      let bestMatch = parseResult.groups[0].key;
      for (const g of parseResult.groups) {
        if (
          areCoursesEquivalent(
            { nombre: g.nombre, grado: g.grado, descGrado: g.descGrado, letra: g.letra },
            { nombre: cursoNombre, nivel: cursoNivel, letra: cursoLetra }
          )
        ) {
          bestMatch = g.key;
          break;
        }
      }
      setSelectedGroupKey(bestMatch);
    };

    reader.onerror = () => {
      setParseError("Error al leer el archivo en el navegador. Intente nuevamente.");
      setIsReadingFile(false);
    };

    reader.readAsText(file, "ISO-8859-1");
  };

  // Grupo actualmente seleccionado
  const currentGroup = useMemo(() => {
    return detectedGroups.find((g) => g.key === selectedGroupKey) || null;
  }, [detectedGroups, selectedGroupKey]);

  // Consultar en Supabase si los RUNs existen en otros cursos (Requisito 11)
  const fetchCrossCourseRuns = useCallback(async (students: SigeParsedStudent[]) => {
    const validRuns = students
      .map((s) => s.run)
      .filter((r): r is number => r !== null && r > 0);

    if (validRuns.length === 0) {
      setCrossCourseData(new Map());
      return;
    }

    setIsCheckingCrossCourse(true);
    try {
      const { data, error } = await supabase
        .from("estudiantes")
        .select("id, run, curso_id, cursos(id, nombre, anio)")
        .in("run", validRuns);

      if (!error && data) {
        const crossMap = new Map<number, { cursoNombre: string; anio: number }>();
        data.forEach((row: unknown) => {
          const item = row as {
            id: number;
            run: number | null;
            curso_id: number;
            cursos: { id: number; nombre: string; anio: number } | null;
          };
          if (item.run && item.curso_id !== cursoId && item.cursos) {
            crossMap.set(item.run, {
              cursoNombre: item.cursos.nombre,
              anio: item.cursos.anio,
            });
          }
        });
        setCrossCourseData(crossMap);
      }
    } catch (err) {
      console.error("Error al consultar RUNs cruzados en Supabase:", err);
    } finally {
      setIsCheckingCrossCourse(false);
    }
  }, [cursoId]);

  useEffect(() => {
    if (currentGroup && currentGroup.students.length > 0) {
      fetchCrossCourseRuns(currentGroup.students);
    } else {
      setCrossCourseData(new Map());
    }
  }, [currentGroup, fetchCrossCourseRuns]);

  // Validar y clasificar cada estudiante del grupo seleccionado
  const validatedStudents = useMemo<StudentValidationInfo[]>(() => {
    if (!currentGroup) return [];

    const students = currentGroup.students;
    const runCountsInFile = new Map<number, number>();
    const listaCountsInFile = new Map<number, number>();

    // Contar duplicados internos dentro del mismo archivo
    students.forEach((s) => {
      if (s.run && s.run > 0) {
        runCountsInFile.set(s.run, (runCountsInFile.get(s.run) || 0) + 1);
      }
      if (s.numeroLista > 0) {
        listaCountsInFile.set(s.numeroLista, (listaCountsInFile.get(s.numeroLista) || 0) + 1);
      }
    });

    return students.map((st) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Validaciones bloqueantes de campos obligatorios
      if (!st.nombres || st.nombres.trim().length === 0) {
        errors.push("Nombres vacíos");
      }
      if (!st.apellidos || st.apellidos.trim().length === 0) {
        errors.push("Apellidos vacíos");
      }
      if (!st.run || isNaN(st.run) || st.run <= 0) {
        errors.push("RUN inválido");
      }
      if (!st.dv || !/^[0-9K]$/.test(st.dv)) {
        errors.push("DV inválido (debe ser 0-9 o K)");
      }
      if (st.numeroLista <= 0) {
        errors.push("N° de lista inválido");
      }

      // Duplicados dentro del mismo grupo del archivo
      if (st.run && (runCountsInFile.get(st.run) || 0) > 1) {
        errors.push("RUN duplicado dentro del archivo");
      }
      if (st.numeroLista > 0 && (listaCountsInFile.get(st.numeroLista) || 0) > 1) {
        errors.push("N° de lista duplicado dentro del archivo");
      }

      // Si tiene errores bloqueantes -> ROJO
      if (errors.length > 0) {
        return {
          student: st,
          status: "error",
          statusMessage: errors.join(", "),
          warnings,
          errors,
        };
      }

      // Verificar si ya existe en el curso destino (PRIORIDAD según Requisito 10)
      // 1. Mismo RUN en el curso destino
      const existingByRun = existingStudents.find((e) => e.run === st.run);
      if (existingByRun) {
        return {
          student: st,
          status: "exists",
          statusMessage: "Ya existe en este curso (mismo RUN)",
          warnings,
          errors,
        };
      }

      // 2. Mismo N° de lista en el curso destino
      const existingByLista = existingStudents.find((e) => e.numero_lista === st.numeroLista);
      if (existingByLista) {
        return {
          student: st,
          status: "exists",
          statusMessage: `Ya existe en este curso (N° de lista ${st.numeroLista} ocupado por ${existingByLista.nombres} ${existingByLista.apellidos})`,
          warnings,
          errors,
        };
      }

      // 3. Mismo Nombre + Apellidos en el curso destino
      const stFullNameNorm = normalizeForComparison(`${st.nombres} ${st.apellidos}`);
      const existingByName = existingStudents.find((e) => {
        const eFullNameNorm = normalizeForComparison(`${e.nombres} ${e.apellidos}`);
        return eFullNameNorm === stFullNameNorm;
      });
      if (existingByName) {
        return {
          student: st,
          status: "exists",
          statusMessage: "Ya existe en este curso (mismo nombre y apellidos)",
          warnings,
          errors,
        };
      }

      // Requisito 11: Advertencia si el RUN existe en otro curso del mismo año escolar
      if (st.run && crossCourseData.has(st.run)) {
        const other = crossCourseData.get(st.run)!;
        if (other.anio === cursoAnio) {
          warnings.push(
            `Este RUN ya aparece matriculado en otro curso del año ${cursoAnio} (${other.cursoNombre}).`
          );
        }
      }

      return {
        student: st,
        status: "new",
        statusMessage: warnings.length > 0 ? "Nuevo (con advertencia)" : "Nuevo — se importará",
        warnings,
        errors,
      };
    });
  }, [currentGroup, existingStudents, crossCourseData, cursoAnio]);

  // Resumen métrico
  const summary = useMemo(() => {
    let total = validatedStudents.length;
    let nuevos = 0;
    let existentes = 0;
    let conAdvertencias = 0;
    let errores = 0;

    validatedStudents.forEach((v) => {
      if (v.status === "new") nuevos++;
      if (v.status === "exists") existentes++;
      if (v.status === "error") errores++;
      if (v.warnings.length > 0) conAdvertencias++;
    });

    return { total, nuevos, existentes, conAdvertencias, errores };
  }, [validatedStudents]);

  // Verificación de si el nivel SIGE es reconocido automáticamente (Etapa 18C - Requisito 7)
  const isLevelUnrecognized = useMemo(() => {
    if (!currentGroup) return false;
    const candidates = [currentGroup.descGrado, currentGroup.grado, currentGroup.nombre].filter(Boolean);
    for (const c of candidates) {
      if (getCanonicalLevel(c)) return false;
    }
    return true;
  }, [currentGroup]);

  // Comparación de nombre de curso detectado vs curso destino mediante equivalencias canónicas (Etapa 13G / 18C)
  const isCourseMismatch = useMemo(() => {
    if (!currentGroup) return false;
    const isEquivalent = areCoursesEquivalent(
      {
        nombre: currentGroup.nombre,
        grado: currentGroup.grado,
        descGrado: currentGroup.descGrado,
        letra: currentGroup.letra,
      },
      {
        nombre: cursoNombre,
        nivel: cursoNivel,
        letra: cursoLetra,
      }
    );
    return !isEquivalent;
  }, [currentGroup, cursoNombre, cursoNivel, cursoLetra]);

  // Importación bloqueada si hay discrepancia de curso no confirmada o no hay alumnos nuevos
  const canImport = useMemo(() => {
    if (summary.nuevos === 0) return false;
    if (isCourseMismatch && !isCourseMismatchConfirmed) return false;
    if (isSubmitting || isReadingFile || isCheckingCrossCourse) return false;
    return true;
  }, [
    summary.nuevos,
    isCourseMismatch,
    isCourseMismatchConfirmed,
    isSubmitting,
    isReadingFile,
    isCheckingCrossCourse,
  ]);

  // Ejecución de la importación en lote (UNA SOLA LLAMADA a Supabase)
  const handleConfirmImport = async () => {
    if (!canImport) return;

    const rowsToInsert = validatedStudents
      .filter((v) => v.status === "new")
      .map((v) => ({
        curso_id: cursoId,
        numero_lista: v.student.numeroLista,
        nombres: v.student.nombres,
        apellidos: v.student.apellidos,
        run: v.student.run,
        dv: v.student.dv,
        activo: true,
      }));

    if (rowsToInsert.length === 0) {
      onError("No hay estudiantes nuevos válidos para importar.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("estudiantes").insert(rowsToInsert);

      if (error) {
        onError(`Error al importar estudiantes: ${error.message}`);
        setIsSubmitting(false);
        return;
      }

      const importedCount = rowsToInsert.length;
      const omittedCount = summary.existentes + summary.errores;

      const successMsg =
        omittedCount > 0
          ? `Se importaron correctamente ${importedCount} estudiantes desde SIGE. ${omittedCount} registros existentes o con error fueron omitidos.`
          : `Se importaron correctamente ${importedCount} estudiantes desde SIGE.`;

      onSuccess(successMsg);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado al conectar con Supabase.";
      onError(msg);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sige-modal-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Cabecera institucional del Modal */}
        <div className="bg-[#0f2942] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-900/90 border border-blue-700/60 flex items-center justify-center text-blue-200 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </div>
            <div>
              <h3 id="sige-modal-title" className="text-lg font-bold tracking-tight">
                Importar Nómina desde SIGE
              </h3>
              <p className="text-xs text-blue-200/90">
                Carga directa de nómina oficial (.xls / HTML) descargada del sistema SIGE MINEDUC.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50"
            title="Cerrar ventana"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 text-sm">
          {/* Ficha institucional del curso destino */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Curso destino en la plataforma
              </span>
              <span className="text-base font-extrabold text-slate-900">
                {cursoNombre} — {cursoAnio}
              </span>
            </div>
            <div className="text-xs text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shrink-0">
              Estudiantes actuales en curso: <strong>{existingStudents.length}</strong>
            </div>
          </div>

          {/* Selector / Carga de archivo .xls */}
          {!currentGroup && (
            <div className="space-y-4">
              <label
                htmlFor="sige-file-input"
                className="border-2 border-dashed border-slate-300 hover:border-blue-700 bg-slate-50/60 hover:bg-blue-50/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all block"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <span className="text-sm font-bold text-slate-900">
                  {isReadingFile ? "Leyendo y analizando archivo..." : "Selecciona o arrastra el archivo .xls de SIGE"}
                </span>
                <span className="text-xs text-slate-500 mt-1 max-w-sm">
                  Formatos aceptados: Nómina oficial descargada desde SIGE (.xls). La lectura se realiza de forma segura en tu navegador.
                </span>
                <input
                  id="sige-file-input"
                  type="file"
                  accept=".xls,.html"
                  onChange={handleFileChange}
                  disabled={isReadingFile}
                  className="hidden"
                />
              </label>

              {isReadingFile && (
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-blue-900 py-2">
                  <div className="w-4 h-4 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
                  <span>Analizando tablas y columnas del archivo SIGE...</span>
                </div>
              )}
            </div>
          )}

          {/* Mensaje de Error si no se pudo leer */}
          {parseError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-xs">
                <strong className="font-bold block text-sm">No se pudo procesar el archivo</strong>
                <p className="mt-0.5">{parseError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setParseError(null);
                  }}
                  className="mt-2 text-xs font-semibold text-rose-700 underline hover:text-rose-900 cursor-pointer"
                >
                  Intentar con otro archivo
                </button>
              </div>
            </div>
          )}

          {/* Cuando el archivo fue leído y contiene cursos */}
          {currentGroup && (
            <div className="space-y-5">
              {/* Selector si hay múltiples cursos en el archivo (Requisito 9) */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <label
                      htmlFor="sige-group-select"
                      className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1"
                    >
                      Curso detectado en archivo SIGE:
                    </label>
                    {detectedGroups.length > 1 ? (
                      <select
                        id="sige-group-select"
                        value={selectedGroupKey}
                        onChange={(e) => {
                          setSelectedGroupKey(e.target.value);
                          setIsCourseMismatchConfirmed(false);
                        }}
                        className="w-full sm:max-w-md px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900"
                      >
                        {detectedGroups.map((g) => (
                          <option key={g.key} value={g.key}>
                            {g.nombre} ({g.students.length} estudiantes)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-900">
                          {currentGroup.nombre}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({currentGroup.students.length} estudiantes detectados)
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setDetectedGroups([]);
                      setSelectedGroupKey("");
                    }}
                    className="text-xs font-semibold text-blue-900 hover:text-blue-700 underline self-start sm:self-center cursor-pointer"
                  >
                    Cambiar archivo ({selectedFile?.name})
                  </button>
                </div>

                {/* Advertencia si el nivel SIGE no es reconocido automáticamente (Etapa 18C - Requisito 7) */}
                {isLevelUnrecognized && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex items-start gap-2.5 text-amber-900 text-xs">
                    <svg className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <div>
                      <strong className="font-bold text-sm block">
                        Nivel no reconocido automáticamente. Revise el curso destino.
                      </strong>
                      <p className="mt-0.5">
                        El curso detectado en el archivo corresponde a <strong>{currentGroup.descGrado || currentGroup.nombre}</strong>. No se descartaron estudiantes. Verifique el curso destino antes de continuar.
                      </p>
                    </div>
                  </div>
                )}

                {/* Advertencia si el curso detectado no coincide con el abierto (Requisito 8) */}
                {isCourseMismatch && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 space-y-2 text-amber-900">
                    <div className="flex items-start gap-2.5 text-xs">
                      <svg className="w-5 h-5 text-amber-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div>
                        <strong className="font-bold text-sm block">
                          El curso detectado en SIGE no coincide con el curso abierto.
                        </strong>
                        <p className="mt-0.5">
                          El archivo SIGE corresponde a <strong>{currentGroup.nombre}</strong>, pero el destino abierto es <strong>{cursoNombre}</strong>.
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 pt-1 text-xs font-bold text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isCourseMismatchConfirmed}
                        onChange={(e) => setIsCourseMismatchConfirmed(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-900 focus:ring-blue-900 border-slate-300 cursor-pointer"
                      />
                      <span>He verificado que este es el curso correcto para importar.</span>
                    </label>
                  </div>
                )}

                {/* Aviso institucional cuando el archivo SIGE no contiene número de lista (Requisito 4) */}
                {!currentGroup.hasOriginalListNumber && (
                  <div className="bg-blue-50/90 border border-blue-200 rounded-xl p-3.5 flex items-start gap-2.5 text-blue-900 text-xs">
                    <svg className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <strong className="font-bold text-sm text-blue-950 block">
                        El archivo SIGE no contiene número de lista.
                      </strong>
                      <p className="mt-0.5 text-blue-800">
                        La plataforma generará la numeración en orden alfabético.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Tarjetas de Resumen (Requisito 12) */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Total detectados</span>
                  <span className="text-xl font-extrabold text-slate-900">{summary.total}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase block">Nuevos</span>
                  <span className="text-xl font-extrabold text-emerald-800">{summary.nuevos}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] font-bold text-amber-700 uppercase block">Ya existentes</span>
                  <span className="text-xl font-extrabold text-amber-800">{summary.existentes}</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] font-bold text-blue-700 uppercase block">Advertencias</span>
                  <span className="text-xl font-extrabold text-blue-800">{summary.conAdvertencias}</span>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-bold text-rose-700 uppercase block">Con errores</span>
                  <span className="text-xl font-extrabold text-rose-800">{summary.errores}</span>
                </div>
              </div>

              {/* Indicador de verificación cruzada de RUNs */}
              {isCheckingCrossCourse && (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                  <span>Verificando coincidencias de RUN en otros cursos del establecimiento...</span>
                </div>
              )}

              {/* Tabla de Vista Previa (Requisito 12) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0f2942] text-white font-semibold uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 text-center w-12">N°</th>
                        <th className="px-3 py-2.5">RUN</th>
                        <th className="px-2 py-2.5 text-center w-10">DV</th>
                        <th className="px-4 py-2.5">Apellidos</th>
                        <th className="px-4 py-2.5">Nombres</th>
                        <th className="px-3 py-2.5 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {validatedStudents.map((item, idx) => {
                        const st = item.student;
                        const formattedRun = formatRutDisplay(st.run, null);

                        let badgeBg = "bg-emerald-50 text-emerald-800 border-emerald-200";
                        let statusText = "Nuevo";
                        if (item.status === "exists") {
                          badgeBg = "bg-amber-50 text-amber-800 border-amber-200";
                          statusText = "Ya existe";
                        } else if (item.status === "error") {
                          badgeBg = "bg-rose-50 text-rose-800 border-rose-200";
                          statusText = "Error";
                        }

                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              item.status === "error"
                                ? "bg-rose-50/30"
                                : item.status === "exists"
                                ? "bg-amber-50/20"
                                : ""
                            }`}
                          >
                            <td className="px-3 py-2 text-center font-bold text-slate-700">
                              {st.numeroLista}
                            </td>
                            <td className="px-3 py-2 font-mono font-medium text-slate-900">
                              {formattedRun || st.rawRun}
                            </td>
                            <td className="px-2 py-2 text-center font-mono font-bold text-slate-900">
                              {st.dv || "—"}
                            </td>
                            <td className="px-4 py-2 font-semibold text-slate-900">
                              {st.apellidos || <span className="text-rose-500 italic">Sin apellidos</span>}
                            </td>
                            <td className="px-4 py-2 text-slate-800">
                              {st.nombres || <span className="text-rose-500 italic">Sin nombres</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeBg}`}
                                  title={item.statusMessage}
                                >
                                  {statusText}
                                </span>
                                {item.warnings.length > 0 && (
                                  <span
                                    className="text-[10px] text-amber-700 font-semibold"
                                    title={item.warnings.join(" | ")}
                                  >
                                    ⚠️ En otro curso
                                  </span>
                                )}
                                {item.status === "error" && (
                                  <span className="text-[10px] text-rose-600">
                                    {item.statusMessage}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pie de modal con confirmación y botón de importación */}
        <div className="bg-slate-50 border-t border-slate-200/90 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 text-center sm:text-left">
            {currentGroup && summary.nuevos > 0 ? (
              <span className="font-medium">
                Se agregarán <strong>{summary.nuevos}</strong> estudiantes al curso{" "}
                <strong>{cursoNombre}</strong>. Esta acción no modifica estudiantes existentes.
              </span>
            ) : currentGroup ? (
              <span className="text-slate-500">
                No hay estudiantes nuevos válidos para importar en este grupo.
              </span>
            ) : (
              <span className="text-slate-500">
                Selecciona un archivo .xls emitido por SIGE para comenzar.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>

            {currentGroup && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={!canImport}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold tracking-wide shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Importando nómina...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Importar {summary.nuevos} estudiantes</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
