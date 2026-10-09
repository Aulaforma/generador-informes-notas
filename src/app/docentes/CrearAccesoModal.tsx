"use client";

import React, { useState, useEffect } from "react";
import { DbDocente } from "@/types/dashboard";
import { supabase } from "@/lib/supabase";

interface CrearAccesoModalProps {
  isOpen: boolean;
  docente: DbDocente | null;
  onClose: () => void;
  onSuccess: (docenteId: number) => void;
}

export function CrearAccesoModal({
  isOpen,
  docente,
  onClose,
  onSuccess,
}: CrearAccesoModalProps) {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [temporalPassword, setTemporalPassword] = useState<string | null>(null);

  // Reiniciar estados cada vez que se abre o cambia el docente
  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setErrorMessage(null);
      setIsSuccess(false);
      setCopied(false);
      setTemporalPassword(null);
    }
  }, [isOpen, docente]);

  if (!isOpen || !docente) return null;

  const handleCopy = () => {
    if (!temporalPassword) return;
    navigator.clipboard.writeText(temporalPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCrearAcceso = async () => {
    if (!docente.email?.trim()) {
      setErrorMessage(
        "El docente no tiene un correo electrónico registrado. No es posible generar su acceso sin un correo institucional."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Obtener token de sesión activo de UTP
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setErrorMessage(
          "No se detectó una sesión institucional activa. Inicie sesión nuevamente."
        );
        setIsSubmitting(false);
        return;
      }

      // 2. Invocar la ruta de servidor administrativa
      const response = await fetch("/api/admin/docentes/crear-acceso", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ docenteId: docente.id }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMessage(
          data.error || "Ocurrió un error inesperado al crear el acceso del docente."
        );
        setIsSubmitting(false);
        return;
      }

      // 3. Guardar contraseña temporal devuelta por el servidor
      if (data.temporalPassword) {
        setTemporalPassword(data.temporalPassword);
      }

      // 4. Éxito: notificar al padre y mostrar vista de confirmación
      setIsSuccess(true);
      onSuccess(docente.id);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error de conexión con el servidor.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl max-w-md w-full overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="bg-[#0f2942] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-900/60 border border-blue-400/30 flex items-center justify-center text-blue-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">
                {isSuccess ? "Acceso creado correctamente" : "Crear acceso de docente"}
              </h3>
              <p className="text-[11px] text-blue-200">
                Liceo Andrés Alcázar · Panel UTP
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 space-y-4">
          {/* Mensaje de Error */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-xl text-xs flex items-start gap-2.5">
              <svg
                className="w-4 h-4 text-rose-600 shrink-0 mt-0.5"
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
              <div className="flex-1">
                <span className="font-bold block text-rose-950">Atención</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* VISTA 1: CONFIRMACIÓN ANTES DE CREAR */}
          {!isSuccess && (
            <>
              <div className="text-sm text-slate-700 space-y-2">
                <p className="font-semibold text-slate-900">
                  Prof. {docente.apellidos}, {docente.nombres}
                </p>
                <p className="text-xs text-slate-600">
                  Se creará un acceso para este docente con una contraseña temporal institucional.
                </p>
              </div>

              {/* Ficha de credenciales a emitir */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/90 space-y-3 text-xs">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Correo registrado:
                  </span>
                  <span className="font-mono text-sm font-semibold text-slate-900 block mt-0.5">
                    {docente.email || (
                      <span className="text-rose-600 italic font-sans text-xs">
                        Sin correo registrado (Requerido)
                      </span>
                    )}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Contraseña temporal:
                  </span>
                  <p className="text-xs text-slate-600 mt-1">
                    Se generará de forma aleatoria y segura al confirmar la creación.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/80 flex items-start gap-2 text-slate-600">
                  <svg
                    className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-[11px] leading-relaxed">
                    El docente deberá cambiar esta contraseña en su primer ingreso.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* VISTA 2: ÉXITO TRAS CREACIÓN */}
          {isSuccess && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-sm text-emerald-900">
                    Acceso creado correctamente.
                  </h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    El usuario ha sido registrado en Supabase Auth y vinculado a su perfil docente.
                  </p>
                </div>
              </div>

              {/* Ficha final para entregar al docente */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 text-xs">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Usuario:
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-900 block mt-0.5">
                    {docente.email}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Contraseña temporal:
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-sm font-bold bg-white px-2.5 py-1 rounded-md border border-slate-300 text-blue-950 select-all">
                      {temporalPassword || "—"}
                    </span>
                    {temporalPassword && (
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="text-xs text-blue-900 hover:text-blue-800 font-semibold px-2 py-1 rounded bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        {copied ? "Copiada" : "Copiar"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-start gap-2 text-slate-600">
                  <svg
                    className="w-4 h-4 text-blue-700 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <p className="text-[11px] leading-relaxed">
                    El docente deberá cambiarla obligatoriamente en su primer ingreso.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pie de botones */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200/80 flex items-center justify-end gap-2.5">
          {!isSuccess ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCrearAcceso}
                disabled={isSubmitting || !docente.email?.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-all shadow-2xs disabled:bg-slate-400 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Creando acceso...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    <span>Crear acceso</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
