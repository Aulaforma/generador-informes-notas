"use client";

import React, { useState, useEffect } from "react";
import { DbDocente } from "@/types/dashboard";
import { supabase } from "@/lib/supabase";

interface RestablecerAccesoModalProps {
  isOpen: boolean;
  docente: DbDocente | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function RestablecerAccesoModal({
  isOpen,
  docente,
  onClose,
  onSuccess,
}: RestablecerAccesoModalProps) {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [temporalPassword, setTemporalPassword] = useState<string | null>(null);

  // Limpiar rigurosamente todos los estados cada vez que se abre o cierra el modal
  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setErrorMessage(null);
      setIsSuccess(false);
      setCopied(false);
      setTemporalPassword(null);
    } else {
      // Al cerrarse, destruir cualquier rastro de la contraseña temporal en memoria
      setTemporalPassword(null);
    }
  }, [isOpen, docente]);

  if (!isOpen || !docente) return null;

  const isInactive = docente.activo === false;

  const handleClose = () => {
    // Asegurar que la contraseña temporal se borre inmediatamente de la memoria
    setTemporalPassword(null);
    onClose();
  };

  const handleCopy = () => {
    if (!temporalPassword) return;
    navigator.clipboard.writeText(temporalPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRestablecer = async () => {
    if (isInactive) {
      setErrorMessage("El acceso de este docente se encuentra desactivado.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Obtener token de sesión activo del usuario UTP
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

      // 2. Invocar el endpoint administrativo de servidor
      const response = await fetch("/api/admin/docentes/restablecer-acceso", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ docente_id: docente.id }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMessage(
          data.error || "Ocurrió un error inesperado al restablecer el acceso del docente."
        );
        setIsSubmitting(false);
        return;
      }

      // 3. Capturar la nueva contraseña temporal retornada una sola vez
      if (data.temporalPassword) {
        setTemporalPassword(data.temporalPassword);
      }

      // 4. Éxito: notificar al componente padre y pasar a la vista de credenciales
      setIsSuccess(true);
      onSuccess();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error de conexión con el servidor.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={handleClose}
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">
                {isSuccess ? "Acceso restablecido correctamente" : "Restablecer acceso"}
              </h3>
              <p className="text-[11px] text-blue-200">
                Liceo Andrés Alcázar · Panel UTP
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
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

          {/* VISTA 1: CONFIRMACIÓN ANTES DE RESTABLECER */}
          {!isSuccess && (
            <>
              {isInactive && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-xs flex items-start gap-2.5">
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
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <span className="font-bold block text-amber-950">Acceso desactivado</span>
                    <span>El acceso de este docente se encuentra desactivado. Debe activarlo en el padrón docente antes de restablecer credenciales.</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-600 leading-relaxed">
                Se generará una nueva contraseña temporal para este docente. Su contraseña anterior dejará de ser válida y deberá establecer una nueva contraseña personal en el siguiente ingreso.
              </p>

              {/* Ficha del Docente */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/90 space-y-3 text-xs">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Docente:
                  </span>
                  <span className="font-semibold text-sm text-slate-900 block mt-0.5">
                    Prof. {docente.apellidos}, {docente.nombres}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Correo:
                  </span>
                  <span className="font-mono text-sm font-semibold text-slate-900 block mt-0.5">
                    {docente.email || (
                      <span className="text-rose-600 italic font-sans text-xs">
                        Sin correo registrado
                      </span>
                    )}
                  </span>
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
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <p className="text-[11px] leading-relaxed">
                    La contraseña temporal se generará de forma aleatoria al confirmar y se mostrará una única vez.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* VISTA 2: ÉXITO TRAS RESTABLECIMIENTO */}
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
                    Acceso restablecido correctamente.
                  </h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Se actualizó Supabase Auth y se activó el cambio obligatorio de contraseña en su perfil.
                  </p>
                </div>
              </div>

              {/* Ficha con contraseña temporal generada */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 text-xs">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    USUARIO:
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-900 block mt-0.5">
                    {docente.email}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    CONTRASEÑA TEMPORAL:
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
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-[11px] leading-relaxed">
                    Entregue esta contraseña al docente. Se mostrará únicamente en esta ventana y deberá cambiarla obligatoriamente al ingresar.
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
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRestablecer}
                disabled={isSubmitting || isInactive}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-all shadow-2xs disabled:bg-slate-400 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Restableciendo...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <span>Restablecer acceso</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleClose}
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
