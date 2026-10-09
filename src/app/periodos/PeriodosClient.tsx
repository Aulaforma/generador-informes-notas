"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { InstitutionalInfo, NavSection, DbPeriodo } from "@/types/dashboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { PeriodoModal } from "./PeriodoModal";

interface PeriodosClientProps {
  institution: InstitutionalInfo;
}

export function PeriodosClient({ institution }: PeriodosClientProps) {
  const { profile, isLoading: authLoading } = useAuth();
  const isUtp = profile?.rol === "utp";

  const [currentSection, setCurrentSection] = useState<NavSection>("periodos");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  // Estados de datos
  const [periodos, setPeriodos] = useState<DbPeriodo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal de edición de período existente
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [periodoToEdit, setPeriodoToEdit] = useState<DbPeriodo | null>(null);

  // Modal de inicialización dinámica de año escolar
  const [isInitModalOpen, setIsInitModalOpen] = useState<boolean>(false);
  const [initAnio, setInitAnio] = useState<number>(new Date().getFullYear());
  const [s1Inicio, setS1Inicio] = useState<string>("");
  const [s1Fin, setS1Fin] = useState<string>("");
  const [s2Inicio, setS2Inicio] = useState<string>("");
  const [s2Fin, setS2Fin] = useState<string>("");
  const [initActivo, setInitActivo] = useState<"1" | "none">("1");
  const [initModalError, setInitModalError] = useState<string | null>(null);
  const [isCreatingPeriods, setIsCreatingPeriods] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Carga de períodos desde Supabase
  const fetchPeriodos = useCallback(async () => {
    if (!isUtp) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from("periodos")
        .select("id, numero, nombre, anio, fecha_inicio, fecha_fin, activo, cerrado")
        .order("anio", { ascending: false })
        .order("numero", { ascending: true });

      if (error) {
        setErrorMsg(`Error al consultar períodos: ${error.message}`);
        setPeriodos([]);
        return;
      }

      setPeriodos((data as DbPeriodo[]) || []);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error inesperado al conectar con Supabase."
      );
      setPeriodos([]);
    } finally {
      setIsLoading(false);
    }
  }, [isUtp]);

  useEffect(() => {
    if (!authLoading && isUtp) {
      fetchPeriodos();
    } else if (!authLoading && !isUtp) {
      setIsLoading(false);
    }
  }, [authLoading, isUtp, fetchPeriodos]);

  // Handlers del modal de edición
  const handleOpenEdit = (periodo: DbPeriodo) => {
    setPeriodoToEdit(periodo);
    setIsModalOpen(true);
  };

  const handleSuccess = (msg: string) => {
    setActiveNotice(msg);
    fetchPeriodos();
  };

  const handleError = (msg: string) => {
    setActiveNotice(`Error: ${msg}`);
  };

  // Acciones de ciclo de vida seguro de períodos (ETAPA 17D)
  const handleActivarPeriodo = async (periodo: DbPeriodo) => {
    if (actionLoadingId !== null) return;
    setActionLoadingId(periodo.id);
    setActiveNotice(null);

    try {
      // Regla: activo = true, cerrado = false. Desactivar otros períodos del mismo año.
      const { error: deactError } = await supabase
        .from("periodos")
        .update({ activo: false })
        .eq("anio", periodo.anio);

      if (deactError) {
        throw new Error(`Error al coordinar períodos del año ${periodo.anio}: ${deactError.message}`);
      }

      const { error: actError } = await supabase
        .from("periodos")
        .update({ activo: true, cerrado: false })
        .eq("id", periodo.id);

      if (actError) {
        throw new Error(`Error al activar período: ${actError.message}`);
      }

      setActiveNotice(`Período "${periodo.nombre}" (${periodo.anio}) establecido como ACTIVO y ABIERTO para calificaciones.`);
      await fetchPeriodos();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error inesperado al activar el período.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCerrarPeriodo = async (periodo: DbPeriodo) => {
    if (actionLoadingId !== null) return;
    setActionLoadingId(periodo.id);
    setActiveNotice(null);

    try {
      // Regla: cerrado = true, activo = false (un período cerrado no debe permanecer activo)
      const { error: closeError } = await supabase
        .from("periodos")
        .update({ cerrado: true, activo: false })
        .eq("id", periodo.id);

      if (closeError) {
        throw new Error(`Error al cerrar período: ${closeError.message}`);
      }

      setActiveNotice(`Período "${periodo.nombre}" (${periodo.anio}) CERRADO (solo lectura).`);
      await fetchPeriodos();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error inesperado al cerrar el período.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReabrirPeriodo = async (periodo: DbPeriodo) => {
    if (actionLoadingId !== null) return;
    setActionLoadingId(periodo.id);
    setActiveNotice(null);

    try {
      // Regla: Reabrir modifica únicamente cerrado = false. NO convierte automáticamente el período en activo.
      const { error: reopenError } = await supabase
        .from("periodos")
        .update({ cerrado: false })
        .eq("id", periodo.id);

      if (reopenError) {
        throw new Error(`Error al reabrir período: ${reopenError.message}`);
      }

      setActiveNotice(`Período "${periodo.nombre}" (${periodo.anio}) REABIERTO para rectificaciones de calificaciones.`);
      await fetchPeriodos();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error inesperado al reabrir el período.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handlers para inicialización dinámica de año escolar
  const handleAnioChange = (newYear: number) => {
    setInitAnio(newYear);
    setInitModalError(null);
    if (newYear && !isNaN(newYear) && newYear >= 2000) {
      setS1Inicio(`${newYear}-03-01`);
      setS1Fin(`${newYear}-07-10`);
      setS2Inicio(`${newYear}-07-27`);
      setS2Fin(`${newYear}-12-15`);
    }
  };

  const handleOpenInitModal = () => {
    const years = periodos
      .map((p) => p.anio)
      .filter((y): y is number => typeof y === "number" && !isNaN(y));
    const currentCalendarYear = new Date().getFullYear();
    let suggestedYear = currentCalendarYear;
    if (years.length > 0) {
      const maxYear = Math.max(...years);
      suggestedYear = years.includes(currentCalendarYear) ? maxYear + 1 : currentCalendarYear;
    }
    handleAnioChange(suggestedYear);
    setInitActivo("1");
    setInitModalError(null);
    setIsInitModalOpen(true);
  };

  const handleCreatePeriods = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !initAnio ||
      isNaN(initAnio) ||
      !Number.isInteger(initAnio) ||
      initAnio < 2000 ||
      initAnio > 2100
    ) {
      setInitModalError("Por favor ingresa un año escolar válido (ej. 2026, 2027).");
      return;
    }

    if (!s1Inicio || !s1Fin) {
      setInitModalError("Debes definir las fechas de inicio y término para el Primer Semestre.");
      return;
    }

    if (s1Inicio >= s1Fin) {
      setInitModalError(
        "En el Primer Semestre, la fecha de inicio debe ser anterior a la fecha de término."
      );
      return;
    }

    if (!s2Inicio || !s2Fin) {
      setInitModalError("Debes definir las fechas de inicio y término para el Segundo Semestre.");
      return;
    }

    if (s2Inicio >= s2Fin) {
      setInitModalError(
        "En el Segundo Semestre, la fecha de inicio debe ser anterior a la fecha de término."
      );
      return;
    }

    if (s1Fin > s2Inicio) {
      setInitModalError(
        "La fecha de término del Primer Semestre no puede ser posterior a la fecha de inicio del Segundo Semestre."
      );
      return;
    }

    // Validación preventiva en memoria si ya existen para este año
    if (periodos.some((p) => p.anio === initAnio)) {
      setInitModalError("Los períodos de este año ya existen.");
      return;
    }

    setIsCreatingPeriods(true);
    setInitModalError(null);

    try {
      // Verificación directa en base de datos para evitar duplicados concurrentes
      const { data: existing, error: checkError } = await supabase
        .from("periodos")
        .select("id")
        .eq("anio", initAnio);

      if (checkError) {
        setInitModalError(`Error al verificar períodos existentes: ${checkError.message}`);
        setIsCreatingPeriods(false);
        return;
      }

      if (existing && existing.length > 0) {
        setInitModalError("Los períodos de este año ya existen.");
        setIsCreatingPeriods(false);
        return;
      }

      // Preparación de los semestres lectivos para el año seleccionado (ETAPA 17D)
      // Regla de Ciclo de Vida Seguro:
      // Si UTP elige "Activar Primer Semestre de inmediato":
      //   - Primer Semestre: activo = true, cerrado = false
      //   - Segundo Semestre: activo = false, cerrado = true (bloqueado preventivamente)
      // Si UTP elige "Dejar ambos inactivos":
      //   - Primer Semestre: activo = false, cerrado = true
      //   - Segundo Semestre: activo = false, cerrado = true (ninguno recibe notas)
      const isS1Activo = initActivo === "1";
      const defaults = [
        {
          numero: 1,
          nombre: "Primer Semestre",
          anio: initAnio,
          fecha_inicio: s1Inicio,
          fecha_fin: s1Fin,
          activo: isS1Activo,
          cerrado: isS1Activo ? false : true,
        },
        {
          numero: 2,
          nombre: "Segundo Semestre",
          anio: initAnio,
          fecha_inicio: s2Inicio,
          fecha_fin: s2Fin,
          activo: false,
          cerrado: true,
        },
      ];

      const { error: insertError } = await supabase.from("periodos").insert(defaults);

      if (insertError) {
        if (
          insertError.code === "23505" ||
          insertError.message.includes("unique") ||
          insertError.message.includes("duplicate")
        ) {
          setInitModalError("Los períodos de este año ya existen.");
        } else {
          setInitModalError(`Error al inicializar períodos: ${insertError.message}`);
        }
        setIsCreatingPeriods(false);
        return;
      }

      setIsCreatingPeriods(false);
      setIsInitModalOpen(false);
      setActiveNotice(`Períodos escolares para el año ${initAnio} inicializados exitosamente.`);
      fetchPeriodos();
    } catch (err: unknown) {
      setInitModalError(
        `Error: ${err instanceof Error ? err.message : "Fallo inesperado al crear períodos"}`
      );
      setIsCreatingPeriods(false);
    }
  };

  // Métricas del resumen superior
  const periodoActual = useMemo(() => {
    return periodos.find((p) => p.activo === true) || null;
  }, [periodos]);

  const anioActivo =
    periodoActual?.anio || (periodos.length > 0 ? periodos[0].anio : new Date().getFullYear());
  const periodosDelAnio = useMemo(() => {
    return periodos.filter((p) => p.anio === anioActivo);
  }, [periodos, anioActivo]);

  // 1. Estado de carga de sesión
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-semibold text-slate-700">
            Verificando credenciales institucionales...
          </p>
        </div>
      </div>
    );
  }

  // 2. Control de Acceso: Bloqueo estricto para no-UTP
  if (!isUtp) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 mx-auto flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Acceso Restringido</h2>
            <p className="text-xs text-slate-500 mt-2">
              Este módulo de administración de períodos académicos es de uso exclusivo para la Unidad Técnica Pedagógica (UTP).
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver al Panel Principal</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Vista Autorizada para UTP
  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Barra lateral */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={(section) => setCurrentSection(section)}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Contenedor principal */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        <Header
          institution={institution}
          onOpenMobileSidebar={() => setIsMobileMenuOpen(true)}
        />

        {/* Notificación flotante */}
        {activeNotice && (
          <div className="fixed top-20 right-4 z-50 max-w-md bg-blue-950 text-white px-4 py-3 rounded-xl shadow-lg border border-blue-800 flex items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-blue-800 flex items-center justify-center shrink-0 text-blue-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-xs">
              <p className="font-semibold text-blue-200">Notificación</p>
              <p className="text-slate-200">{activeNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setActiveNotice(null)}
              className="ml-auto text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link href="/" className="hover:text-blue-900 font-medium transition-colors">
                Panel UTP
              </Link>
              <span>/</span>
              <span className="text-slate-900 font-semibold">Períodos Académicos</span>
            </div>
          </nav>

          {/* Encabezado del Módulo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Períodos Académicos
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Año lectivo {anioActivo}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Administración de semestres, fechas lectivas y estado de apertura o cierre para el registro de calificaciones.
              </p>
            </div>

            <div>
              <button
                type="button"
                onClick={handleOpenInitModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-900"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Inicializar año escolar</span>
              </button>
            </div>
          </div>

          {/* Tarjetas de Resumen Superior */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Período Actual
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-extrabold text-slate-900 truncate">
                  {periodoActual ? periodoActual.nombre : "Sin definir"}
                </span>
                {periodoActual && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Activo
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {periodoActual ? `Año escolar ${periodoActual.anio}` : "No hay período activo"}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Períodos del Año {anioActivo}
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-blue-900">
                  {isLoading ? "—" : periodosDelAnio.length}
                </span>
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                  Registrados
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {periodos.length} períodos totales en el sistema
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Estado del Período Actual
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-extrabold text-slate-900">
                  {!periodoActual
                    ? "Sin período"
                    : periodoActual.cerrado
                    ? "Cerrado"
                    : "Abierto"}
                </span>
                {periodoActual && (
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      periodoActual.cerrado
                        ? "bg-slate-100 text-slate-700 border border-slate-200"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    }`}
                  >
                    {periodoActual.cerrado ? "Solo lectura" : "Permite notas"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {!periodoActual
                  ? "Configura un período en curso"
                  : periodoActual.cerrado
                  ? "Calificaciones bloqueadas para edición"
                  : "Ingreso y modificación de notas habilitado"}
              </p>
            </div>
          </div>

          {/* Error de carga */}
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={fetchPeriodos}
                className="underline font-semibold hover:text-red-900"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Tabla de Períodos */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Listado de Períodos Académicos
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gestiona la vigencia y el estado de cierre de cada semestre lectivo.
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-slate-500 space-y-3">
                <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-medium">Cargando períodos desde Supabase...</p>
              </div>
            ) : periodos.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    No hay períodos académicos registrados
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    La tabla institucional de períodos aún no tiene semestres definidos.
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleOpenInitModal}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Inicializar año escolar</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/75 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th scope="col" className="px-6 py-3.5">
                        Período
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-center">
                        Año
                      </th>
                      <th scope="col" className="px-6 py-3.5">
                        Fechas Lectivas
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-center">
                        Vigencia
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-center">
                        Estado Notas
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-right">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {periodos.map((periodo) => {
                      const isActivo = periodo.activo === true;
                      const isCerrado = periodo.cerrado === true;
                      const isReabierto = !isActivo && !isCerrado;

                      const fechaStr =
                        periodo.fecha_inicio && periodo.fecha_fin
                          ? `${periodo.fecha_inicio} al ${periodo.fecha_fin}`
                          : periodo.fecha_inicio
                          ? `Desde ${periodo.fecha_inicio}`
                          : "Fechas no definidas";

                      return (
                        <tr
                          key={periodo.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          {/* Nombre del Período */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                  isActivo
                                    ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                    : "bg-slate-100 text-slate-600 border border-slate-200"
                                }`}
                              >
                                {periodo.numero}°
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 block text-sm">
                                  {periodo.nombre}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  ID #{periodo.id} · Período ordinal {periodo.numero}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Año */}
                          <td className="px-6 py-4 text-center">
                            <span className="font-extrabold text-slate-900">
                              {periodo.anio}
                            </span>
                          </td>

                          {/* Fechas */}
                          <td className="px-6 py-4 text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>{fechaStr}</span>
                            </span>
                          </td>

                          {/* Vigencia (Activo / Inactivo) */}
                          <td className="px-6 py-4 text-center">
                            {isActivo ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Activo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                Inactivo
                              </span>
                            )}
                          </td>

                          {/* Estado Notas (Abierto / Cerrado / Abierto para rectificaciones) */}
                          <td className="px-6 py-4 text-center">
                            {isActivo && !isCerrado ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                Abierto
                              </span>
                            ) : isReabierto ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs"
                                title="Período no activo reabierto deliberadamente por UTP para rectificaciones de calificaciones"
                              >
                                <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Abierto para rectificaciones
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
                                <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                Cerrado
                              </span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Botón Activar (si no está activo) */}
                              {!isActivo && (
                                <button
                                  type="button"
                                  onClick={() => handleActivarPeriodo(periodo)}
                                  disabled={actionLoadingId === periodo.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                                  title={`Marcar ${periodo.nombre} como período activo del año ${periodo.anio} (se abrirá para notas)`}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                  <span>{actionLoadingId === periodo.id ? "Guardando..." : "Activar"}</span>
                                </button>
                              )}

                              {/* Botón Cerrar (si está abierto) */}
                              {!isCerrado ? (
                                <button
                                  type="button"
                                  onClick={() => handleCerrarPeriodo(periodo)}
                                  disabled={actionLoadingId === periodo.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                                  title={`Cerrar ${periodo.nombre} para bloquear ingreso de notas`}
                                >
                                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  <span>{actionLoadingId === periodo.id ? "Guardando..." : "Cerrar"}</span>
                                </button>
                              ) : (
                                /* Botón Reabrir (si está cerrado) */
                                <button
                                  type="button"
                                  onClick={() => handleReabrirPeriodo(periodo)}
                                  disabled={actionLoadingId === periodo.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                                  title={`Reabrir ${periodo.nombre} exclusivamente para rectificaciones (no activo)`}
                                >
                                  <svg className="w-3.5 h-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                  </svg>
                                  <span>{actionLoadingId === periodo.id ? "Guardando..." : "Reabrir"}</span>
                                </button>
                              )}

                              {/* Botón Editar */}
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(periodo)}
                                disabled={actionLoadingId === periodo.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-semibold shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer disabled:opacity-50"
                              >
                                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span>Editar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal de Edición de Período */}
      <PeriodoModal
        isOpen={isModalOpen}
        periodoToEdit={periodoToEdit}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
        onError={handleError}
      />

      {/* Modal de Inicialización Dinámica de Año Escolar */}
      {isInitModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-init-year-title"
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
                  <h3 id="modal-init-year-title" className="text-base font-bold text-slate-900 tracking-tight">
                    Inicializar Año Escolar
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Crea los semestres lectivos oficiales para el año académico seleccionado.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInitModalOpen(false)}
                disabled={isCreatingPeriods}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
                aria-label="Cerrar modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleCreatePeriods} className="p-6 space-y-5 overflow-y-auto">
              {initModalError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{initModalError}</span>
                </div>
              )}

              {/* Campo Año Escolar */}
              <div>
                <label htmlFor="init-year-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Año Escolar
                </label>
                <input
                  id="init-year-input"
                  type="number"
                  min={2020}
                  max={2100}
                  value={initAnio || ""}
                  onChange={(e) => handleAnioChange(parseInt(e.target.value, 10) || 0)}
                  disabled={isCreatingPeriods}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition-all"
                  placeholder="Ej: 2027"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Se generarán automáticamente el Primer Semestre (N° 1) y Segundo Semestre (N° 2) para este año.
                </p>
              </div>

              {/* Fechas Primer Semestre */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-blue-950 uppercase tracking-wider">
                    Primer Semestre (N° 1)
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    Semestre 1
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="s1-inicio" className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Fecha inicio
                    </label>
                    <input
                      id="s1-inicio"
                      type="date"
                      value={s1Inicio}
                      onChange={(e) => setS1Inicio(e.target.value)}
                      disabled={isCreatingPeriods}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="s1-fin" className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Fecha término
                    </label>
                    <input
                      id="s1-fin"
                      type="date"
                      value={s1Fin}
                      onChange={(e) => setS1Fin(e.target.value)}
                      disabled={isCreatingPeriods}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Fechas Segundo Semestre */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-blue-950 uppercase tracking-wider">
                    Segundo Semestre (N° 2)
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    Semestre 2
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="s2-inicio" className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Fecha inicio
                    </label>
                    <input
                      id="s2-inicio"
                      type="date"
                      value={s2Inicio}
                      onChange={(e) => setS2Inicio(e.target.value)}
                      disabled={isCreatingPeriods}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="s2-fin" className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Fecha término
                    </label>
                    <input
                      id="s2-fin"
                      type="date"
                      value={s2Fin}
                      onChange={(e) => setS2Fin(e.target.value)}
                      disabled={isCreatingPeriods}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Período Activo Inicial */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Período Activo Inicial
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="init-activo-radio"
                      checked={initActivo === "1"}
                      onChange={() => setInitActivo("1")}
                      disabled={isCreatingPeriods}
                      className="text-blue-900 focus:ring-blue-900 mt-0.5"
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800">
                        Activar Primer Semestre de inmediato (Recomendado)
                      </span>
                      <span className="text-[11px] text-slate-500 mt-0.5">
                        El Primer Semestre quedará <strong>activo y abierto</strong> para notas. El Segundo Semestre quedará <strong>inactivo y cerrado</strong> preventivamente.
                      </span>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="init-activo-radio"
                      checked={initActivo === "none"}
                      onChange={() => setInitActivo("none")}
                      disabled={isCreatingPeriods}
                      className="text-blue-900 focus:ring-blue-900 mt-0.5"
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800">
                        Dejar ambos inactivos
                      </span>
                      <span className="text-[11px] text-slate-500 mt-0.5">
                        Ambos semestres quedarán <strong>inactivos y cerrados</strong> (ninguno aceptará calificaciones hasta que UTP active uno).
                      </span>
                    </div>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ciclo de vida seguro: previene el ingreso accidental de calificaciones en períodos futuros o no inaugurados.
                </p>
              </div>

              {/* Botones de acción */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsInitModalOpen(false)}
                  disabled={isCreatingPeriods}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingPeriods}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isCreatingPeriods ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creando...</span>
                    </>
                  ) : (
                    <span>Crear períodos</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
