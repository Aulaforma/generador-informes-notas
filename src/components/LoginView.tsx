"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      setErrorMessage("Por favor ingrese su correo electrónico y contraseña.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await login(email, password);
      if (!result.success) {
        setErrorMessage(
          result.error || "Error al iniciar sesión. Verifique sus credenciales."
        );
      }
    } catch {
      setErrorMessage("Ocurrió un error inesperado al conectar con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#071527] text-white px-4 sm:px-6 lg:px-8 relative overflow-hidden select-none">
      {/* Fondo con diseño geométrico sutil institucional */}
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
                d="M12 14l9-5-9-5-9 5 9 5z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
              />
            </svg>
          </div>

          <div>
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-blue-950 text-blue-300 border border-blue-800/80 mb-2">
              Acceso Oficial · Panel UTP
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Libreta de Notas
            </h1>
            <p className="text-sm font-medium text-slate-300 mt-1">
              Liceo Andrés Alcázar de Tucapel
            </p>
          </div>
        </div>

        {/* Tarjeta de Formulario de Inicio de Sesión */}
        <div className="bg-[#0b1d33]/90 backdrop-blur-md rounded-2xl border border-blue-900/60 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="border-b border-slate-700/60 pb-4">
            <h2 className="text-base font-bold text-white">Iniciar Sesión</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ingrese con sus credenciales institucionales para acceder a la gestión curricular.
            </p>
          </div>

          {/* Mensaje de error claro en español */}
          {errorMessage && (
            <div className="bg-rose-950/70 border border-rose-600/70 text-rose-200 px-4 py-3 rounded-xl text-xs flex items-start gap-3 animate-shake">
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
            {/* Campo Correo Electrónico */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-200 uppercase tracking-wider"
              >
                Correo electrónico
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  disabled={isSubmitting}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@liceo.cl"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#071527] border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                />
              </div>
            </div>

            {/* Campo Contraseña */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-200 uppercase tracking-wider"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#071527] border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                />
              </div>
            </div>

            {/* Botón Iniciar Sesión con Estado de Carga */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:bg-blue-950/60 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#0b1d33] cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Iniciando sesión...</span>
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
                        d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                      />
                    </svg>
                    <span>Iniciar sesión</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Información Institucional Segura */}
          <div className="pt-3 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-400">
              Sistema protegido mediante autenticación institucional de Supabase.
            </p>
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
