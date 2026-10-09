"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DbAsignatura, DbDocente } from "@/types/dashboard";

interface AddSubjectToCourseModalProps {
  isOpen: boolean;
  courseId: number;
  asignaturasDisponibles: DbAsignatura[];
  docentes: DbDocente[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function AddSubjectToCourseModal({
  isOpen,
  courseId,
  asignaturasDisponibles,
  docentes,
  onClose,
  onSuccess,
  onError,
}: AddSubjectToCourseModalProps) {
  const [selectedAsignaturaId, setSelectedAsignaturaId] = useState<string>("");
  const [selectedDocenteId, setSelectedDocenteId] = useState<string>("");
  const [incidePromedio, setIncidePromedio] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedAsignaturaId("");
      setSelectedDocenteId("");
      setIncidePromedio(true);
      setIsSubmitting(false);
      setValidationError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasAvailableSubjects = asignaturasDisponibles.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasAvailableSubjects) return;

    if (!selectedAsignaturaId) {
      setValidationError("Debe seleccionar una asignatura para agregarla al plan de estudio.");
      return;
    }

    const asigId = parseInt(selectedAsignaturaId, 10);
    const docId = selectedDocenteId ? parseInt(selectedDocenteId, 10) : null;

    if (isNaN(asigId) || asigId <= 0) {
      setValidationError("La asignatura seleccionada no es válida.");
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      const { error } = await supabase
        .from("curso_asignaturas")
        .insert({
          curso_id: courseId,
          asignatura_id: asigId,
          docente_id: docId || null,
          incide_promedio: incidePromedio,
        });

      if (error) {
        // Manejo específico del código 23505 (violación de clave única)
        if (
          error.code === "23505" ||
          error.message?.includes("23505") ||
          error.message?.toLowerCase().includes("unique constraint") ||
          error.message?.toLowerCase().includes("duplicate key")
        ) {
          onError("Esta asignatura ya está vinculada al curso.");
        } else {
          onError(`Error al vincular asignatura: ${error.message}`);
        }
        setIsSubmitting(false);
        return;
      }

      const asigName =
        asignaturasDisponibles.find((a) => a.id === asigId)?.nombre || "Asignatura";
      onSuccess(`Asignatura "${asigName}" agregada exitosamente al curso.`);
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error inesperado al conectar con Supabase.";
      onError(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-add-subject-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado del Modal */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-900 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 id="modal-add-subject-title" className="text-base font-bold text-slate-900 tracking-tight">
                Agregar Asignatura al Curso
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Selecciona una materia activa del catálogo institucional para este curso.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
            aria-label="Cerrar modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mensaje de error de validación local */}
        {validationError && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{validationError}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {!hasAvailableSubjects ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1 text-center">
              <p className="font-semibold text-amber-900">Catálogo completo</p>
              <p>
                Todas las asignaturas activas del catálogo ya están vinculadas a este curso.
              </p>
            </div>
          ) : (
            <>
              {/* Campo: Asignatura (Obligatoria) */}
              <div>
                <label
                  htmlFor="asig-select"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
                >
                  Asignatura <span className="text-red-500">*</span>
                </label>
                <select
                  id="asig-select"
                  value={selectedAsignaturaId}
                  onChange={(e) => {
                    setSelectedAsignaturaId(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="">— Seleccionar asignatura disponible —</option>
                  {asignaturasDisponibles.map((asig) => (
                    <option key={asig.id} value={asig.id}>
                      {asig.nombre} (ID #{asig.id})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Solo se listan materias activas que aún no están asignadas a este curso.
                </p>
              </div>

              {/* Campo: Docente Responsable (Opcional) */}
              <div>
                <label
                  htmlFor="doc-select"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
                >
                  Docente Responsable <span className="text-slate-400 font-normal text-[11px]">(Opcional)</span>
                </label>
                <select
                  id="doc-select"
                  value={selectedDocenteId}
                  onChange={(e) => setSelectedDocenteId(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition-all cursor-pointer"
                >
                  <option value="">— Sin asignar (asignar posteriormente) —</option>
                  {docentes.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      Prof. {doc.apellidos}, {doc.nombres}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Puedes dejarla sin asignar y asignarla más adelante desde la tarjeta de la materia.
                </p>
              </div>

              {/* Campo: Incide en el promedio general */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Incide en el promedio general
                </label>
                <div className="flex items-center gap-5 pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="incide_promedio"
                      checked={incidePromedio}
                      onChange={() => setIncidePromedio(true)}
                      disabled={isSubmitting}
                      className="text-blue-900 focus:ring-blue-900 h-4 w-4"
                    />
                    <span>Sí</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="incide_promedio"
                      checked={!incidePromedio}
                      onChange={() => setIncidePromedio(false)}
                      disabled={isSubmitting}
                      className="text-blue-900 focus:ring-blue-900 h-4 w-4"
                    />
                    <span>No</span>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Si se selecciona &quot;No&quot;, la asignatura mantiene calificaciones y promedios propios, pero no participa del promedio general semestral ni anual.
                </p>
              </div>
            </>
          )}

          {/* Botones de acción */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            {hasAvailableSubjects && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Vinculando...</span>
                  </>
                ) : (
                  <span>Vincular al curso</span>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
