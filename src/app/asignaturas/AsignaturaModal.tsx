"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DbAsignatura } from "@/types/dashboard";

interface AsignaturaModalProps {
  isOpen: boolean;
  asignaturaToEdit: DbAsignatura | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function AsignaturaModal({
  isOpen,
  asignaturaToEdit,
  onClose,
  onSuccess,
  onError,
}: AsignaturaModalProps) {
  const isEditing = Boolean(asignaturaToEdit);

  const [nombre, setNombre] = useState<string>("");
  const [activo, setActivo] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (asignaturaToEdit) {
        setNombre(asignaturaToEdit.nombre || "");
        setActivo(asignaturaToEdit.activo !== false);
      } else {
        setNombre("");
        setActivo(true);
      }
      setValidationError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, asignaturaToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanNombre = nombre.trim();

    if (!cleanNombre) {
      setValidationError("El nombre de la asignatura es obligatorio.");
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      if (isEditing && asignaturaToEdit) {
        // Modo EDITAR
        const { error } = await supabase
          .from("asignaturas")
          .update({
            nombre: cleanNombre,
            activo: activo,
          })
          .eq("id", asignaturaToEdit.id);

        if (error) {
          onError(`Error al actualizar asignatura: ${error.message}`);
          setIsSubmitting(false);
          return;
        }

        onSuccess(`Asignatura "${cleanNombre}" actualizada exitosamente.`);
        onClose();
      } else {
        // Modo CREAR
        const { error } = await supabase
          .from("asignaturas")
          .insert({
            nombre: cleanNombre,
            activo: true,
          });

        if (error) {
          onError(`Error al crear asignatura: ${error.message}`);
          setIsSubmitting(false);
          return;
        }

        onSuccess(`Asignatura "${cleanNombre}" registrada exitosamente en el catálogo.`);
        onClose();
      }
    } catch (err: unknown) {
      onError(
        err instanceof Error
          ? `Error inesperado: ${err.message}`
          : "Error inesperado al conectar con el servidor."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asignatura-modal-title"
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del modal */}
        <div className="bg-linear-to-r from-blue-900 to-indigo-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-blue-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <div>
              <h3 id="asignatura-modal-title" className="text-lg font-bold text-white tracking-tight">
                {isEditing ? "Editar Asignatura" : "Nueva Asignatura"}
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                {isEditing
                  ? "Modifica los datos o vigencia de la asignatura en el catálogo."
                  : "Registra una nueva materia en el catálogo institucional del liceo."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/70 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-50"
            aria-label="Cerrar modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {validationError && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-3.5 rounded-xl flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{validationError}</span>
            </div>
          )}

          {/* Campo Nombre */}
          <div className="space-y-1.5">
            <label htmlFor="nombre" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Nombre de la Asignatura <span className="text-red-500">*</span>
            </label>
            <input
              id="nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Matemática, Artes Visuales, Ciencias Naturales..."
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
              autoFocus
            />
            <p className="text-[11px] text-slate-500">
              Nombre oficial con el que figurará en el plan de estudios y en las libretas de notas.
            </p>
          </div>

          {/* Campo Activo (solo en modo edición o visualización de estado) */}
          {isEditing && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Estado institucional
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {activo
                      ? "Asignatura activa y disponible para nuevas asignaciones curriculares."
                      : "Asignatura inactiva para nuevas asignaciones."}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                    disabled={isSubmitting}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Advertencia visual al desactivar */}
              {!activo && (
                <div className="mt-3 bg-amber-50 border border-amber-200/90 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5 animate-fade-in">
                  <svg
                    className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-amber-950">Aviso de desactivación</p>
                    <p className="text-amber-800 leading-relaxed">
                      Esta asignatura dejará de estar disponible para nuevas asignaciones curriculares, pero su historial académico se conservará.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || nombre.trim().length === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-xl shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{isEditing ? "Guardar cambios" : "Crear asignatura"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
