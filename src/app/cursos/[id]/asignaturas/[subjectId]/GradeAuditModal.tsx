"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  DbEvaluacion,
  DbStudent,
  DbCalificacionAuditoria,
} from "@/types/dashboard";

interface GradeAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  cursoNombre: string;
  asignaturaNombre: string;
  periodoNombre: string;
  evaluaciones: DbEvaluacion[];
  estudiantes: DbStudent[];
}

interface UserProfileSimple {
  id: string;
  nombre: string;
  rol: string;
}

// Formatea fecha en formato chileno DD/MM/YYYY HH:mm
function formatChileanDateTime(isoDateString: string): string {
  try {
    const d = new Date(isoDateString);
    if (isNaN(d.getTime())) return isoDateString;

    const pad = (n: number) => n.toString().padStart(2, "0");
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoDateString;
  }
}

// Formatea nota visualmente con coma decimal (escala chilena 1,0 a 7,0 o "Sin nota")
function formatGradeDisplay(gradeVal: number | null | undefined): string {
  if (gradeVal === null || gradeVal === undefined || isNaN(Number(gradeVal))) {
    return "Sin nota";
  }
  return Number(gradeVal).toFixed(1).replace(".", ",");
}

// Configuración visual para badges de acción
function getActionBadge(accion: string): { label: string; className: string } {
  switch (accion) {
    case "INSERT":
      return {
        label: "Ingreso",
        className: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    case "UPDATE":
      return {
        label: "Modificación",
        className: "bg-blue-50 text-blue-800 border-blue-200",
      };
    case "CLEAR":
      return {
        label: "Vaciado",
        className: "bg-amber-50 text-amber-800 border-amber-200",
      };
    case "DELETE":
      return {
        label: "Eliminación",
        className: "bg-rose-50 text-rose-800 border-rose-200",
      };
    default:
      return {
        label: accion,
        className: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
}

export function GradeAuditModal({
  isOpen,
  onClose,
  cursoNombre,
  asignaturaNombre,
  periodoNombre,
  evaluaciones,
  estudiantes,
}: GradeAuditModalProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<DbCalificacionAuditoria[]>([]);
  const [userProfilesMap, setUserProfilesMap] = useState<
    Map<string, UserProfileSimple>
  >(new Map());

  // Estados de filtros internos
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<string>("");
  const [selectedEvalFilter, setSelectedEvalFilter] = useState<string>("");
  const [selectedAccionFilter, setSelectedAccionFilter] = useState<string>("");

  // Mapas de consulta rápida para estudiantes y evaluaciones
  const studentsMap = useMemo(() => {
    const map = new Map<number, DbStudent>();
    estudiantes.forEach((st) => map.set(st.id, st));
    return map;
  }, [estudiantes]);

  const evaluationsMap = useMemo(() => {
    const map = new Map<number, DbEvaluacion>();
    evaluaciones.forEach((ev) => map.set(ev.id, ev));
    return map;
  }, [evaluaciones]);

  // Carga del historial acotado al curso, asignatura y período actual
  const loadAuditData = useCallback(async () => {
    if (evaluaciones.length === 0) {
      setAuditRows([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const evalIds = evaluaciones.map((e) => e.id);

    try {
      // 1. Consultar registros de auditoría para las evaluaciones del período actual
      const { data: rawAudit, error: auditErr } = await supabase
        .from("calificaciones_auditoria")
        .select(
          "id, calificacion_id, estudiante_id, evaluacion_id, nota_anterior, nota_nueva, accion, usuario_id, created_at"
        )
        .in("evaluacion_id", evalIds)
        .order("created_at", { ascending: false });

      if (auditErr) {
        console.error("Error al consultar calificaciones_auditoria:", auditErr);
        setErrorMessage("No fue posible cargar el historial de cambios.");
        setAuditRows([]);
        return;
      }

      const rows = (rawAudit as DbCalificacionAuditoria[]) || [];
      setAuditRows(rows);

      // 2. Extraer UUIDs únicos de usuario para resolver perfiles en una sola consulta (evitar N+1)
      const userUuids = Array.from(
        new Set(
          rows
            .map((r) => r.usuario_id)
            .filter((uid): uid is string => Boolean(uid))
        )
      );

      if (userUuids.length > 0) {
        const { data: profilesData, error: profErr } = await supabase
          .from("perfiles")
          .select("id, nombre, rol")
          .in("id", userUuids);

        if (!profErr && profilesData) {
          const pMap = new Map<string, UserProfileSimple>();
          (profilesData as UserProfileSimple[]).forEach((p) => {
            pMap.set(p.id, p);
          });
          setUserProfilesMap(pMap);
        }
      } else {
        setUserProfilesMap(new Map());
      }
    } catch (err) {
      console.error("Error inesperado al cargar auditoría:", err);
      setErrorMessage("No fue posible cargar el historial de cambios.");
      setAuditRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [evaluaciones]);

  useEffect(() => {
    if (isOpen) {
      setSelectedStudentFilter("");
      setSelectedEvalFilter("");
      setSelectedAccionFilter("");
      loadAuditData();
    }
  }, [isOpen, loadAuditData]);

  // Aplicar filtros en memoria
  const filteredRows = useMemo(() => {
    return auditRows.filter((row) => {
      if (selectedStudentFilter && row.estudiante_id.toString() !== selectedStudentFilter) {
        return false;
      }
      if (selectedEvalFilter && row.evaluacion_id.toString() !== selectedEvalFilter) {
        return false;
      }
      if (selectedAccionFilter && row.accion !== selectedAccionFilter) {
        return false;
      }
      return true;
    });
  }, [auditRows, selectedStudentFilter, selectedEvalFilter, selectedAccionFilter]);

  // Reset de filtros
  const handleResetFilters = () => {
    setSelectedStudentFilter("");
    setSelectedEvalFilter("");
    setSelectedAccionFilter("");
  };

  const hasActiveFilters =
    Boolean(selectedStudentFilter) ||
    Boolean(selectedEvalFilter) ||
    Boolean(selectedAccionFilter);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="grade-audit-modal-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h3 id="grade-audit-modal-title" className="text-lg font-bold tracking-tight">
                Historial de Cambios de Calificaciones
              </h3>
              <p className="text-xs text-blue-200/90">
                Auditoría oficial de trazabilidad para {asignaturaNombre} · {cursoNombre} ({periodoNombre})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
            title="Cerrar ventana"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Panel de filtros rápidos */}
        <div className="bg-slate-50 border-b border-slate-200/80 p-4 shrink-0">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
              {/* Filtro por Estudiante */}
              <div>
                <label
                  htmlFor="filter-student"
                  className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1"
                >
                  Estudiante:
                </label>
                <select
                  id="filter-student"
                  value={selectedStudentFilter}
                  onChange={(e) => setSelectedStudentFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
                >
                  <option value="">Todos los estudiantes ({estudiantes.length})</option>
                  {estudiantes.map((st) => (
                    <option key={st.id} value={st.id.toString()}>
                      N° {st.numero_lista} — {st.apellidos}, {st.nombres}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Evaluación */}
              <div>
                <label
                  htmlFor="filter-evaluation"
                  className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1"
                >
                  Evaluación:
                </label>
                <select
                  id="filter-evaluation"
                  value={selectedEvalFilter}
                  onChange={(e) => setSelectedEvalFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
                >
                  <option value="">Todas las evaluaciones ({evaluaciones.length})</option>
                  {evaluaciones.map((ev) => (
                    <option key={ev.id} value={ev.id.toString()}>
                      {ev.nombre} (Orden #{ev.orden})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Acción */}
              <div>
                <label
                  htmlFor="filter-accion"
                  className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1"
                >
                  Acción:
                </label>
                <select
                  id="filter-accion"
                  value={selectedAccionFilter}
                  onChange={(e) => setSelectedAccionFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
                >
                  <option value="">Todas las acciones</option>
                  <option value="INSERT">Ingreso (INSERT)</option>
                  <option value="UPDATE">Modificación (UPDATE)</option>
                  <option value="CLEAR">Vaciado (CLEAR)</option>
                  <option value="DELETE">Eliminación (DELETE)</option>
                </select>
              </div>
            </div>

            {/* Botón para Limpiar filtros */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="self-end md:self-auto px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors shrink-0 cursor-pointer"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Contenido principal scrolleable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-slate-800 text-xs">
          {/* Estado de Carga */}
          {isLoading && (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-500 font-medium">
                Cargando historial de cambios de calificaciones...
              </p>
            </div>
          )}

          {/* Estado de Error */}
          {!isLoading && errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center text-rose-900 max-w-md mx-auto my-8 space-y-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center mx-auto text-lg">
                !
              </div>
              <div>
                <h4 className="font-bold text-sm text-rose-900">Error al consultar auditoría</h4>
                <p className="text-xs text-rose-700 mt-1">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={loadAuditData}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Reintentar consulta
              </button>
            </div>
          )}

          {/* Estado Vacío (Sin registros) */}
          {!isLoading && !errorMessage && filteredRows.length === 0 && (
            <div className="py-16 text-center space-y-3 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800">
                  {hasActiveFilters
                    ? "No hay cambios que coincidan con los filtros seleccionados."
                    : "No hay cambios registrados para este período."}
                </h4>
                <p className="text-slate-500 text-xs mt-1">
                  {hasActiveFilters
                    ? "Prueba modificando o limpiando los filtros para ver otros registros."
                    : "Todas las calificaciones de esta asignatura se encuentran en su estado original sin registros de auditoría."}
                </p>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-900 text-white text-xs font-semibold hover:bg-blue-800 transition-colors cursor-pointer"
                >
                  Restablecer filtros
                </button>
              )}
            </div>
          )}

          {/* Tabla de Historial de Auditoría */}
          {!isLoading && !errorMessage && filteredRows.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0f2942] text-white font-semibold uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="px-3.5 py-3 w-36">Fecha y hora</th>
                      <th className="px-4 py-3">Estudiante</th>
                      <th className="px-3 py-3">Evaluación</th>
                      <th className="px-3.5 py-3 text-center">Cambio</th>
                      <th className="px-3 py-3 text-center w-28">Acción</th>
                      <th className="px-4 py-3">Usuario responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => {
                      const st = studentsMap.get(row.estudiante_id);
                      const ev = evaluationsMap.get(row.evaluacion_id);
                      const profile = row.usuario_id
                        ? userProfilesMap.get(row.usuario_id)
                        : null;

                      const studentName = st
                        ? `${st.apellidos}, ${st.nombres}`
                        : `Estudiante #${row.estudiante_id}`;
                      const studentLista = st?.numero_lista ? `N° ${st.numero_lista}` : "—";
                      const evalName = ev ? ev.nombre : `Eval. #${row.evaluacion_id}`;

                      const gradeBefore = formatGradeDisplay(row.nota_anterior);
                      const gradeAfter = formatGradeDisplay(row.nota_nueva);

                      const badge = getActionBadge(row.accion);

                      const userDisplay = profile
                        ? `${profile.nombre} (${profile.rol.toUpperCase()})`
                        : row.usuario_id
                        ? "Usuario no disponible"
                        : "Sistema automático";

                      return (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Fecha y hora */}
                          <td className="px-3.5 py-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                            {formatChileanDateTime(row.created_at)}
                          </td>

                          {/* Estudiante */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                                {st?.numero_lista || "·"}
                              </span>
                              <div>
                                <span className="font-semibold text-slate-900 block">
                                  {studentName}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  Lista: {studentLista}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Evaluación */}
                          <td className="px-3 py-3 text-slate-800 font-medium whitespace-nowrap">
                            {evalName}
                          </td>

                          {/* Cambio de nota */}
                          <td className="px-3.5 py-3 text-center whitespace-nowrap font-mono">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200">
                              <span
                                className={
                                  row.nota_anterior === null
                                    ? "text-slate-400 italic font-sans text-[11px]"
                                    : "font-bold text-slate-700"
                                }
                              >
                                {gradeBefore}
                              </span>
                              <span className="text-slate-400 font-sans">→</span>
                              <span
                                className={
                                  row.nota_nueva === null
                                    ? "text-rose-600 italic font-sans text-[11px]"
                                    : "font-extrabold text-blue-900"
                                }
                              >
                                {gradeAfter}
                              </span>
                            </span>
                          </td>

                          {/* Acción (Badge) */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </td>

                          {/* Usuario responsable */}
                          <td className="px-4 py-3 text-slate-800 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-900 border border-blue-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                                {profile?.rol === "utp" ? "U" : "D"}
                              </span>
                              <span className="font-medium text-slate-900">{userDisplay}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Pie de modal informativo y solo lectura */}
        <div className="bg-slate-50 border-t border-slate-200/90 p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-slate-500 text-[11px] text-center sm:text-left">
            <span>
              Registros visualizados: <strong>{filteredRows.length}</strong> de{" "}
              <strong>{auditRows.length}</strong> eventos registrados en este período.
            </span>
            <span className="block text-[10px] text-slate-400 mt-0.5">
              Trazabilidad inmutable de solo lectura protegida por políticas de auditoría.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            Cerrar historial
          </button>
        </div>
      </div>
    </div>
  );
}
