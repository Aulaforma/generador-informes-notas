"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export function CambiarPasswordClient() {
  const router = useRouter();
  const { logout, refreshProfile } = useAuth();

  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [showNuevaPassword, setShowNuevaPassword] = useState(false);
  const [showConfirmarPassword, setShowConfirmarPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Validación de requerimientos
  const hasMinLength = nuevaPassword.length >= 8;
  const hasLetter = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(nuevaPassword);
  const hasNumber = /\d/.test(nuevaPassword);
  const passwordsMatch =
    nuevaPassword.length > 0 &&
    confirmarPassword.length > 0 &&
    nuevaPassword === confirmarPassword;

  const validate = (): string | null => {
    if (!nuevaPassword.trim() || !confirmarPassword.trim()) {
      return "Todos los campos son obligatorios.";
    }

    if (nuevaPassword.length < 8) {
      return "La contraseña debe contener al menos 8 caracteres.";
    }

    if (!hasLetter || !hasNumber) {
      return "La contraseña debe incluir letras y números.";
    }

    if (nuevaPassword !== confirmarPassword) {
      return "Las contraseñas no coinciden.";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);

    // 1. Validaciones previas en el cliente
    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      // 2. Verificar que exista una sesión autenticada
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        setErrorMessage(
          "No existe una sesión activa. Debe estar autenticado para cambiar su contraseña."
        );
        setIsSubmitting(false);
        return;
      }

      // 3. Utilizar Supabase Auth para actualizar la contraseña del usuario autenticado
      const { error: authError } = await supabase.auth.updateUser({
        password: nuevaPassword,
      });

      if (authError) {
        let msg = `Error al actualizar la contraseña: ${authError.message}`;
        if (authError.message.includes("Password should be")) {
          msg = "La contraseña no cumple con las políticas de seguridad del servidor.";
        }
        setErrorMessage(msg);
        setIsSubmitting(false);
        return;
      }

      // 4. Solo si Supabase confirma correctamente el cambio:
      // Invocar función RPC con SECURITY DEFINER para actualizar exclusivamente debe_cambiar_password = false
      const { error: profileError } =
        await supabase.rpc("marcar_password_actualizado");

      if (profileError) {
        console.error("Error en marcar_password_actualizado:", profileError);
        setErrorMessage(
          "La contraseña fue actualizada, pero no fue posible finalizar la configuración de acceso. Contacte a UTP."
        );
        setIsSubmitting(false);
        return;
      }

      // Sincronizar el estado del perfil en AuthContext
      await refreshProfile();

      // 5. Mostrar confirmación exitosa
      setSuccessMessage("Contraseña actualizada correctamente.");

      // Limpiar campos por seguridad (no almacenar en memoria ni componentes)
      setNuevaPassword("");
      setConfirmarPassword("");

      // 6. Redirigir al inicio del sistema tras breve confirmación visual
      setTimeout(() => {
        router.push("/");
      }, 1500);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado al procesar la solicitud.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#071527] text-white px-4 sm:px-6 lg:px-8 relative overflow-hidden select-none">
      {/* Fondo con diseño geométrico institucional */}
      <div className="absolute inset-0 opacity-15 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-600 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-700 blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Cabecera Institucional */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-900 border border-blue-600/40 text-white shadow-lg mx-auto">
            <svg
              className="w-9 h-9 text-blue-200"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          <div>
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-950 text-blue-300 border border-blue-800/80 mb-2">
              Seguridad de la Cuenta · Liceo Andrés Alcázar
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Cambiar contraseña
            </h1>
            <p className="text-sm font-medium text-slate-300 mt-2 max-w-sm mx-auto">
              Por seguridad, debes establecer una nueva contraseña personal antes de continuar.
            </p>
          </div>
        </div>

        {/* Tarjeta de Formulario */}
        <div className="bg-[#0b1d33]/90 backdrop-blur-md rounded-2xl border border-blue-900/60 p-6 sm:p-8 shadow-2xl space-y-5">
          {/* Mensaje de Éxito */}
          {successMessage && (
            <div className="bg-emerald-950/70 border border-emerald-600/70 text-emerald-200 px-4 py-3 rounded-xl text-xs flex items-start gap-3">
              <svg
                className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <span className="font-bold block text-emerald-100">Operación exitosa</span>
                <span>{successMessage}</span>
                <p className="text-[11px] text-emerald-300/80 mt-1">
                  Redirigiendo al panel principal...
                </p>
              </div>
            </div>
          )}

          {/* Mensaje de Error */}
          {errorMessage && (
            <div className="bg-rose-950/70 border border-rose-600/70 text-rose-200 px-4 py-3 rounded-xl text-xs flex items-start gap-3">
              <svg
                className="w-5 h-5 text-rose-400 shrink-0 mt-0.5"
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
                <span className="font-bold block text-rose-100">Atención</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Campo 1: Nueva contraseña */}
            <div className="space-y-1.5">
              <label
                htmlFor="nuevaPassword"
                className="block text-xs font-semibold text-slate-200 uppercase tracking-wider"
              >
                Nueva contraseña
              </label>
              <div className="relative">
                <input
                  id="nuevaPassword"
                  type={showNuevaPassword ? "text" : "password"}
                  required
                  autoFocus
                  disabled={isSubmitting || Boolean(successMessage)}
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres alfanuméricos"
                  className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-[#071527] border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNuevaPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 focus:outline-none transition-colors"
                  aria-label={showNuevaPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showNuevaPassword ? (
                    /* Ojo tachado */
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    /* Ojo normal */
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Campo 2: Confirmar nueva contraseña */}
            <div className="space-y-1.5">
              <label
                htmlFor="confirmarPassword"
                className="block text-xs font-semibold text-slate-200 uppercase tracking-wider"
              >
                Confirmar nueva contraseña
              </label>
              <div className="relative">
                <input
                  id="confirmarPassword"
                  type={showConfirmarPassword ? "text" : "password"}
                  required
                  disabled={isSubmitting || Boolean(successMessage)}
                  value={confirmarPassword}
                  onChange={(e) => setConfirmarPassword(e.target.value)}
                  placeholder="Repita la nueva contraseña"
                  className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-[#071527] border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmarPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 focus:outline-none transition-colors"
                  aria-label={showConfirmarPassword ? "Ocultar confirmación de contraseña" : "Mostrar confirmación de contraseña"}
                >
                  {showConfirmarPassword ? (
                    /* Ojo tachado */
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    /* Ojo normal */
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Requisitos visuales dinámicos */}
            <div className="bg-[#071527]/70 rounded-xl p-3 border border-slate-800 text-[11px] space-y-1.5">
              <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                Requisitos de seguridad:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-300">
                <div className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-400 font-medium" : ""}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? "bg-emerald-400" : "bg-slate-600"}`}></span>
                  Mínimo 8 caracteres
                </div>
                <div className={`flex items-center gap-1.5 ${hasLetter ? "text-emerald-400 font-medium" : ""}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${hasLetter ? "bg-emerald-400" : "bg-slate-600"}`}></span>
                  Al menos una letra
                </div>
                <div className={`flex items-center gap-1.5 ${hasNumber ? "text-emerald-400 font-medium" : ""}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${hasNumber ? "bg-emerald-400" : "bg-slate-600"}`}></span>
                  Al menos un número
                </div>
                <div className={`flex items-center gap-1.5 ${passwordsMatch ? "text-emerald-400 font-medium" : ""}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? "bg-emerald-400" : "bg-slate-600"}`}></span>
                  Contraseñas coinciden
                </div>
              </div>
            </div>

            {/* Botón Cambiar contraseña */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || Boolean(successMessage)}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:bg-blue-950/60 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#0b1d33] cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Actualizando contraseña...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4 text-blue-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>Cambiar contraseña</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Botón de cierre de sesión institucional */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => logout()}
              disabled={isSubmitting}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline-offset-4 hover:underline cursor-pointer disabled:opacity-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* Pie de página institucional */}
        <p className="text-center text-xs text-slate-500">
          © 2026 Liceo Andrés Alcázar de Tucapel — Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
