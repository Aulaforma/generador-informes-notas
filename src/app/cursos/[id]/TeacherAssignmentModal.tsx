"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DbDocente } from "@/types/dashboard";

interface TeacherAssignmentModalProps {
  isOpen: boolean;
  mode: "profesor_jefe" | "asignatura";
  docentes: DbDocente[];
  currentDocenteId: number | null;
  targetId: number;
  targetTitle?: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function TeacherAssignmentModal({
  isOpen,
  mode,
  docentes,
  currentDocenteId,
  targetId,
  targetTitle,
  onClose,
  onSuccess,
  onError,
}: TeacherAssignmentModalProps) {
  const isProfJefe = mode === "profesor_jefe";
  const [selectedDocenteId, setSelectedDocenteId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedDocenteId(currentDocenteId !== null && currentDocenteId !== undefined ? currentDocenteId.toString() : "");
      setIsSubmitting(false);
    }
  }, [isOpen, currentDocenteId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const docIdOrNull = selectedDocenteId.trim() !== "" ? parseInt(selectedDocenteId, 10) : null;

    try {
      if (isProfJefe) {
        // Actualizar profesor_jefe_id en cursos
        const { error } = await supabase
          .from("cursos")
          .update({ profesor_jefe_id: docIdOrNull })
          .eq("id", targetId);

        if (error) {
          onError(`Error al actualizar Profesor Jefe: ${error.message}`);
          setIsSubmitting(false);
          return;
        }

        const docSelected = docentes.find((d) => d.id === docIdOrNull);
        const nameText = docSelected
          ? `Prof. ${docSelected.nombres} ${docSelected.apellidos}`
          : "Sin asignar";
        onSuccess(`Profesor(a) Jefe actualizado correctamente a: ${nameText}.`);
        onClose();
      } else {
        // Actualizar docente_id en curso_asignaturas
        const { error } = await supabase
          .from("curso_asignaturas")
          .update({ docente_id: docIdOrNull })
          .eq("id", targetId);

        if (error) {
          onError(`Error al asignar docente a la asignatura: ${error.message}`);
          setIsSubmitting(false);
          return;
        }

        const docSelected = docentes.find((d) => d.id === docIdOrNull);
        const nameText = docSelected
          ? `Prof. ${docSelected.nombres} ${docSelected.apellidos}`
          : "Sin asignar";
        onSuccess(
          targetTitle
            ? `Docente para "${targetTitle}" asignado a: ${nameText}.`
            : `Docente asignado correctamente a: ${nameText}.`
        );
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado al conectar con Supabase.";
      onError(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-modal-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-md overflow-hidden flex flex-col"
      >
        {/* Encabezado del modal */}
        <div className="bg-[#0f2942] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-900/80 border border-blue-700/60 flex items-center justify-center text-blue-200 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h3 id="teacher-modal-title" className="text-base font-bold tracking-tight text-white">
                {isProfJefe ? "Cambiar Profesor(a) Jefe" : "Asignar Docente"}
              </h3>
              <p className="text-xs text-slate-300">
                {targetTitle ? targetTitle : "Gestión académica · Rol UTP"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors focus:outline-none cursor-pointer"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="select-docente" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              {isProfJefe ? "Seleccionar Profesor(a) Jefe" : "Seleccionar Docente Responsable"}
            </label>

            <select
              id="select-docente"
              value={selectedDocenteId}
              disabled={isSubmitting}
              onChange={(e) => setSelectedDocenteId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 transition-colors"
            >
              <option value="">— Sin asignar —</option>
              {docentes.map((doc) => (
                <option key={doc.id} value={doc.id.toString()}>
                  Prof. {doc.apellidos}, {doc.nombres} (ID #{doc.id})
                </option>
              ))}
            </select>

            <span className="text-[11px] text-slate-400 mt-2 block">
              {isProfJefe
                ? "El docente designado como Profesor Jefe tendrá acceso al consolidado de este curso."
                : "El docente seleccionado tendrá atribuciones para registrar calificaciones en esta asignatura."}
            </span>
          </div>

          {/* Botones de acción */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-blue-900 hover:bg-blue-800 text-white transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar asignación</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
