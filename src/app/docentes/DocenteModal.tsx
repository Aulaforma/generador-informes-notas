"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DbDocente } from "@/types/dashboard";

interface DocenteModalProps {
  isOpen: boolean;
  docenteToEdit: DbDocente | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function DocenteModal({
  isOpen,
  docenteToEdit,
  onClose,
  onSuccess,
  onError,
}: DocenteModalProps) {
  const isEditing = Boolean(docenteToEdit);

  const [nombres, setNombres] = useState<string>("");
  const [apellidos, setApellidos] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [activo, setActivo] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (docenteToEdit) {
        setNombres(docenteToEdit.nombres || "");
        setApellidos(docenteToEdit.apellidos || "");
        setEmail(docenteToEdit.email || "");
        setActivo(docenteToEdit.activo !== false);
      } else {
        setNombres("");
        setApellidos("");
        setEmail("");
        setActivo(true);
      }
      setValidationError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, docenteToEdit]);

  if (!isOpen) return null;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = email.trim() === "" || emailRegex.test(email.trim());
  const isFormValid = nombres.trim().length > 0 && apellidos.trim().length > 0 && isEmailValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanNombres = nombres.trim();
    const cleanApellidos = apellidos.trim();
    const cleanEmail = email.trim() || null;

    if (!cleanNombres) {
      setValidationError("El campo nombres es obligatorio.");
      return;
    }
    if (!cleanApellidos) {
      setValidationError("El campo apellidos es obligatorio.");
      return;
    }
    if (cleanEmail && !emailRegex.test(cleanEmail)) {
      setValidationError("El correo electrónico ingresado no tiene un formato válido.");
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      if (isEditing && docenteToEdit) {
        // Modo EDITAR
        const { error } = await supabase
          .from("docentes")
          .update({
            nombres: cleanNombres,
            apellidos: cleanApellidos,
            email: cleanEmail,
            activo: activo,
          })
          .eq("id", docenteToEdit.id);

        if (error) {
          onError(`Error al actualizar docente: ${error.message}`);
          setIsSubmitting(false);
          return;
        }

        onSuccess(`Docente Prof. ${cleanNombres} ${cleanApellidos} actualizado exitosamente.`);
        onClose();
      } else {
        // Modo CREAR
        const { error } = await supabase
          .from("docentes")
          .insert({
            nombres: cleanNombres,
            apellidos: cleanApellidos,
            email: cleanEmail,
            activo: true,
          });

        if (error) {
          onError(`Error al registrar docente: ${error.message}`);
          setIsSubmitting(false);
          return;
        }

        onSuccess(`Docente Prof. ${cleanNombres} ${cleanApellidos} creado exitosamente.`);
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
        aria-labelledby="docente-modal-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden flex flex-col"
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
              <h3 id="docente-modal-title" className="text-base font-bold tracking-tight text-white">
                {isEditing ? "Editar Docente" : "Nuevo Docente"}
              </h3>
              <p className="text-xs text-slate-300">
                Padrón docente institucional · Rol UTP
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

          {/* Nombres */}
          <div>
            <label htmlFor="docente-nombres" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Nombres <span className="text-rose-600">*</span>
            </label>
            <input
              id="docente-nombres"
              type="text"
              required
              disabled={isSubmitting}
              value={nombres}
              onChange={(e) => setNombres(e.target.value)}
              placeholder="Ej: Marcela Alejandra"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 transition-colors"
            />
          </div>

          {/* Apellidos */}
          <div>
            <label htmlFor="docente-apellidos" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Apellidos <span className="text-rose-600">*</span>
            </label>
            <input
              id="docente-apellidos"
              type="text"
              required
              disabled={isSubmitting}
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              placeholder="Ej: Soto Morales"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="docente-email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Correo Electrónico <span className="text-slate-400 font-normal">(Opcional)</span>
            </label>
            <input
              id="docente-email"
              type="email"
              disabled={isSubmitting}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ej: marcela.soto@colegio.cl"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-blue-900 transition-colors"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Correo institucional para asociación con cuentas de usuario.
            </span>
          </div>

          {/* Estado Activo / Inactivo (solo en edición o selección) */}
          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Estado de la Dotación
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
                    {activo ? "Docente Activo (Vigente)" : "Docente Inactivo (Desvinculado)"}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {activo
                      ? "Habilitado para nuevas asignaciones de cursos y materias."
                      : "No disponible para nuevas asignaciones académicas."}
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

            {/* Advertencia visual al desactivar */}
            {!activo && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5 animate-fade-in">
                <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="space-y-0.5">
                  <span className="font-bold block">Advertencia de Desactivación:</span>
                  <p className="text-amber-800">
                    Este docente dejará de aparecer en nuevas asignaciones. Si posee una cuenta asociada, su acceso también será desactivado.
                  </p>
                </div>
              </div>
            )}
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
                <span>{isEditing ? "Guardar cambios" : "Registrar docente"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
