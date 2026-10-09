"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DbPeriodo } from "@/types/dashboard";

interface PeriodoModalProps {
  isOpen: boolean;
  periodoToEdit: DbPeriodo | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function PeriodoModal({
  isOpen,
  periodoToEdit,
  onClose,
  onSuccess,
  onError,
}: PeriodoModalProps) {
  const [nombre, setNombre] = useState<string>("");
  const [fechaInicio, setFechaInicio] = useState<string>("");
  const [fechaFin, setFechaFin] = useState<string>("");
  const [activo, setActivo] = useState<boolean>(false);
  const [cerrado, setCerrado] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && periodoToEdit) {
      setNombre(periodoToEdit.nombre || "");
      setFechaInicio(periodoToEdit.fecha_inicio ? periodoToEdit.fecha_inicio.substring(0, 10) : "");
      setFechaFin(periodoToEdit.fecha_fin ? periodoToEdit.fecha_fin.substring(0, 10) : "");
      setActivo(periodoToEdit.activo === true);
      setCerrado(periodoToEdit.cerrado === true);
      setValidationError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, periodoToEdit]);

  if (!isOpen || !periodoToEdit) return null;

  const originalCerrado = periodoToEdit.cerrado === true;
  const isClosing = !originalCerrado && cerrado;
  const isReopening = originalCerrado && !cerrado;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanNombre = nombre.trim();
    if (!cleanNombre) {
      setValidationError("El nombre del período es obligatorio.");
      return;
    }

    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      setValidationError("La fecha de inicio no puede ser posterior a la fecha de término.");
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      // Regla de Ciclo de Vida Seguro (ETAPA 17D):
      // - Si se activa -> activo = true, cerrado = false
      // - Si se cierra -> activo = false, cerrado = true
      // - Si se reabre -> activo = false, cerrado = false
      let finalActivo = activo;
      let finalCerrado = cerrado;
      if (activo) {
        finalActivo = true;
        finalCerrado = false;
      } else if (cerrado) {
        finalActivo = false;
        finalCerrado = true;
      }

      // Regla A: Solo un período activo por año
      // Si se activa este período, primero desactivar los otros del mismo año
      if (finalActivo) {
        const { error: deactivateError } = await supabase
          .from("periodos")
          .update({ activo: false })
          .eq("anio", periodoToEdit.anio);

        if (deactivateError) {
          onError(`Error al coordinar período activo: ${deactivateError.message}`);
          setIsSubmitting(false);
          return;
        }
      }

      // Actualizar el período seleccionado con estados coherentes
      const { error: updateError } = await supabase
        .from("periodos")
        .update({
          nombre: cleanNombre,
          fecha_inicio: fechaInicio || null,
          fecha_fin: fechaFin || null,
          activo: finalActivo,
          cerrado: finalCerrado,
        })
        .eq("id", periodoToEdit.id);

      if (updateError) {
        onError(`Error al actualizar período: ${updateError.message}`);
        setIsSubmitting(false);
        return;
      }

      onSuccess(`Período "${cleanNombre}" actualizado exitosamente.`);
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error inesperado al conectar con Supabase.";
      onError(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-periodo-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-900 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h3 id="modal-periodo-title" className="text-base font-bold text-slate-900 tracking-tight">
                Editar Período Académico
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Período N° {periodoToEdit.numero} · Año lectivo {periodoToEdit.anio}
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

        {/* Error local */}
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
          {/* Identificadores fijos / informativos */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                N° de Período
              </span>
              <span className="text-sm font-extrabold text-slate-900">
                {periodoToEdit.numero}° Período
              </span>
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Año Escolar
              </span>
              <span className="text-sm font-extrabold text-slate-900">
                {periodoToEdit.anio}
              </span>
            </div>
          </div>

          {/* Campo: Nombre */}
          <div>
            <label
              htmlFor="periodo-nombre"
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Nombre Institucional <span className="text-red-500">*</span>
            </label>
            <input
              id="periodo-nombre"
              type="text"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="Ej. Primer Semestre, Segundo Semestre"
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition-all"
            />
          </div>

          {/* Fechas de inicio y término */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="periodo-inicio"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Fecha de Inicio
              </label>
              <input
                id="periodo-inicio"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label
                htmlFor="periodo-fin"
                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Fecha de Término
              </label>
              <input
                id="periodo-fin"
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Switch: Período Activo */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Período Activo (Año {periodoToEdit.anio})
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Determina cuál es el período en curso para el liceo.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => {
                    const nextVal = e.target.checked;
                    setActivo(nextVal);
                    if (nextVal) {
                      setCerrado(false); // Al activar, debe quedar abierto para notas
                    }
                  }}
                  disabled={isSubmitting}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
            {activo && !periodoToEdit.activo && (
              <p className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                Al activar este período, los demás períodos del año {periodoToEdit.anio} pasarán automáticamente a no activos y este período quedará abierto para notas.
              </p>
            )}
          </div>

          {/* Switch: Estado Abierto / Cerrado */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Cierre de Período
                </span>
                <span className="text-[11px] text-slate-500 block">
                  {cerrado ? "Período actualmente cerrado (Solo lectura)" : "Período actualmente abierto (Permite notas)"}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={cerrado}
                  onChange={(e) => {
                    const nextVal = e.target.checked;
                    setCerrado(nextVal);
                    if (nextVal) {
                      setActivo(false); // Un período cerrado no debe ser activo
                    }
                  }}
                  disabled={isSubmitting}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-emerald-500 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-600"></div>
              </label>
            </div>

            {/* Advertencia B: Cierre */}
            {isClosing && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5">
                <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  Al cerrar este período, el ingreso y modificación de calificaciones quedará bloqueado una vez aplicada la protección de notas.
                </span>
              </div>
            )}

            {/* Advertencia C: Reapertura */}
            {isReopening && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-start gap-2.5">
                <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  El período volverá a permitir modificaciones académicas cuando se habilite la protección de notas.
                </span>
              </div>
            )}
          </div>

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
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar cambios</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
