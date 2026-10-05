"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DbStudent } from "@/types/dashboard";

interface StudentAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  cursoId: number;
  studentToEdit: DbStudent | null;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function StudentAdminModal({
  isOpen,
  onClose,
  cursoId,
  studentToEdit,
  onSuccess,
  onError,
}: StudentAdminModalProps) {
  const isEditing = Boolean(studentToEdit);

  const [numeroLista, setNumeroLista] = useState<string>("");
  const [nombres, setNombres] = useState<string>("");
  const [apellidos, setApellidos] = useState<string>("");
  const [activo, setActivo] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (studentToEdit) {
        setNumeroLista(studentToEdit.numero_lista ? studentToEdit.numero_lista.toString() : "");
        setNombres(studentToEdit.nombres || "");
        setApellidos(studentToEdit.apellidos || "");
        setActivo(studentToEdit.activo !== false);
      } else {
        setNumeroLista("");
        setNombres("");
        setApellidos("");
        setActivo(true);
      }
      setValidationError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, studentToEdit]);

  if (!isOpen) return null;

  const parsedNumeroLista = parseInt(numeroLista.trim(), 10);
  const isNumeroListaValid = !isNaN(parsedNumeroLista) && parsedNumeroLista > 0;
  const isNombresValid = nombres.trim().length > 0;
  const isApellidosValid = apellidos.trim().length > 0;
  const isFormValid = isNumeroListaValid && isNombresValid && isApellidosValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isNombresValid) {
      setValidationError("El campo nombres es obligatorio.");
      return;
    }
    if (!isApellidosValid) {
      setValidationError("El campo apellidos es obligatorio.");
      return;
    }
    if (!isNumeroListaValid) {
      setValidationError("El número de lista debe ser un entero mayor que 0.");
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      if (isEditing && studentToEdit) {
        // Modo EDITAR
        const { error } = await supabase
          .from("estudiantes")
          .update({
            numero_lista: parsedNumeroLista,
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            activo: activo,
          })
          .eq("id", studentToEdit.id);

        if (error) {
          onError(`Error al actualizar estudiante: ${error.message}`);
          setIsSubmitting(false);
          return;
        }

        onSuccess(`Estudiante "${nombres.trim()} ${apellidos.trim()}" actualizado correctamente.`);
        onClose();
      } else {
        // Modo CREAR
        const { error } = await supabase
          .from("estudiantes")
          .insert({
            curso_id: cursoId,
            numero_lista: parsedNumeroLista,
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            activo: activo,
          });

        if (error) {
          onError(`Error al crear estudiante: ${error.message}`);
          setIsSubmitting(false);
          return;
        }

        onSuccess(`Estudiante "${nombres.trim()} ${apellidos.trim()}" matriculado correctamente.`);
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
        aria-labelledby="student-modal-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden flex flex-col"
      >
        {/* Encabezado del modal */}
        <div className="bg-[#0f2942] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-900/80 border border-blue-700/60 flex items-center justify-center text-blue-200 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isEditing ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                )}
              </svg>
            </div>
            <div>
              <h3 id="student-modal-title" className="text-base font-bold tracking-tight text-white">
                {isEditing ? "Editar Estudiante" : "Nuevo Estudiante"}
              </h3>
              <p className="text-xs text-slate-300">
                Gestión administrativa institucional · Rol UTP
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
          {validationError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{validationError}</span>
            </div>
          )}

          {/* N° de lista */}
          <div>
            <label htmlFor="student-numero-lista" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              N.° de Lista <span className="text-rose-600">*</span>
            </label>
            <input
              id="student-numero-lista"
              type="number"
              min="1"
              step="1"
              required
              disabled={isSubmitting}
              value={numeroLista}
              onChange={(e) => setNumeroLista(e.target.value)}
              placeholder="Ej: 1"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 transition-colors"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Número correlativo de lista en el curso (entero mayor que 0).
            </span>
          </div>

          {/* Nombres */}
          <div>
            <label htmlFor="student-nombres" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Nombres <span className="text-rose-600">*</span>
            </label>
            <input
              id="student-nombres"
              type="text"
              required
              disabled={isSubmitting}
              value={nombres}
              onChange={(e) => setNombres(e.target.value)}
              placeholder="Ej: Matías Ignacio"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 transition-colors"
            />
          </div>

          {/* Apellidos */}
          <div>
            <label htmlFor="student-apellidos" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Apellidos <span className="text-rose-600">*</span>
            </label>
            <input
              id="student-apellidos"
              type="text"
              required
              disabled={isSubmitting}
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              placeholder="Ej: Aguilar Castillo"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 transition-colors"
            />
          </div>

          {/* Estado Activo / Inactivo */}
          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Estado de Matrícula
            </label>
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    activo ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                ></span>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    {activo ? "Matrícula Regular (Activo)" : "Estudiante Inactivo (Retirado)"}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {activo
                      ? "Aparece con estado Regular en nóminas y libreta oficial."
                      : "No computa en evaluaciones activas de la institución."}
                  </span>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={activo}
                  disabled={isSubmitting}
                  onChange={(e) => setActivo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-900"></div>
              </label>
            </div>
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
              disabled={!isFormValid || isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-blue-900 hover:bg-blue-800 text-white transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{isEditing ? "Guardar cambios" : "Matricular estudiante"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
