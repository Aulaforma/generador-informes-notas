"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  CourseData,
  InstitutionalInfo,
  NavSection,
  DbStudent,
  DbCursoAsignatura,
  DbCurso,
  DbDocente,
  DbAsignatura,
} from "@/types/dashboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { StudentAdminModal } from "./StudentAdminModal";
import { TeacherAssignmentModal } from "./TeacherAssignmentModal";
import { CursoModal } from "@/app/CursoModal";
import { AddSubjectToCourseModal } from "./AddSubjectToCourseModal";
import { SigeImportModal } from "./SigeImportModal";

interface CourseViewClientProps {
  courseId?: string;
  course?: CourseData;
  institution: InstitutionalInfo;
}

// Función auxiliar para normalizar nombres en comparaciones sin distinción de tildes o mayúsculas
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Función para formatear el docente obtenido desde Supabase
const getTeacherDisplay = (item: DbCursoAsignatura): string => {
  if (item.docente_id === null || item.docente_id === undefined) {
    return "Docente no asignado";
  }
  if (!item.docentes) {
    return "Docente no disponible";
  }
  return `Prof. ${item.docentes.nombres} ${item.docentes.apellidos}`;
};

export function CourseViewClient({
  courseId,
  course,
  institution,
}: CourseViewClientProps) {
  const { profile, isLoading: authLoading } = useAuth();
  const isUtp = profile?.rol === "utp";
  const isDocente = profile?.rol === "docente";

  const [currentSection, setCurrentSection] = useState<NavSection>("cursos");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  // Estado para curso no encontrado o sin acceso
  const [courseNotFound, setCourseNotFound] = useState<boolean>(false);

  // Estados para la nómina de estudiantes desde Supabase (Etapa 1)
  const [students, setStudents] = useState<DbStudent[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  // Estados para las asignaturas vinculadas desde Supabase (Etapa 2)
  const [cursoAsignaturas, setCursoAsignaturas] = useState<DbCursoAsignatura[]>([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState<boolean>(true);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);

  // Estados para datos del curso y profesor jefe dinámico desde Supabase
  const [headTeacher, setHeadTeacher] = useState<string>("Sin profesor(a) jefe asignado(a)");
  const [isLoadingHeadTeacher, setIsLoadingHeadTeacher] = useState<boolean>(true);
  const [profesorJefeId, setProfesorJefeId] = useState<number | null>(null);

  const initialNumericId = Number(courseId || course?.id);
  const [resolvedCursoId, setResolvedCursoId] = useState<number>(
    !isNaN(initialNumericId) && initialNumericId > 0 ? initialNumericId : 0
  );

  // Estados para datos del curso editables y modal de edición de curso (rol UTP)
  const [courseName, setCourseName] = useState<string>(course?.fullTitle || "");
  const [courseNivel, setCourseNivel] = useState<string>(course?.level || "");
  const [courseLetra, setCourseLetra] = useState<string>(course?.section || "");
  const [courseAnio, setCourseAnio] = useState<number>(course?.schoolYear || 2026);
  const [courseActivo, setCourseActivo] = useState<boolean>(true);
  const [isCursoEditModalOpen, setIsCursoEditModalOpen] = useState<boolean>(false);

  // Estados para modal de administración de estudiantes (rol UTP)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState<boolean>(false);
  const [studentToEdit, setStudentToEdit] = useState<DbStudent | null>(null);
  const [isSigeImportModalOpen, setIsSigeImportModalOpen] = useState<boolean>(false);

  // Estados para la lista de docentes activos y modal de asignaciones (rol UTP)
  const [activeDocentes, setActiveDocentes] = useState<DbDocente[]>([]);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState<boolean>(false);
  const [teacherModalMode, setTeacherModalMode] = useState<"profesor_jefe" | "asignatura">("profesor_jefe");
  const [teacherModalCurrentDocId, setTeacherModalCurrentDocId] = useState<number | null>(null);
  const [teacherModalTargetId, setTeacherModalTargetId] = useState<number>(0);
  const [teacherModalTargetTitle, setTeacherModalTargetTitle] = useState<string>("");
  const [teacherModalCurrentIncidePromedio, setTeacherModalCurrentIncidePromedio] = useState<boolean>(true);

  // Handlers para administración de estudiantes
  const handleOpenCreateStudent = () => {
    setStudentToEdit(null);
    setIsStudentModalOpen(true);
  };

  const handleOpenEditStudent = (st: DbStudent) => {
    setStudentToEdit(st);
    setIsStudentModalOpen(true);
  };

  const handleStudentSuccess = (message: string) => {
    setActiveNotice(message);
    fetchStudentsFromSupabase(resolvedCursoId);
  };

  const handleStudentError = (message: string) => {
    setActiveNotice(`Error: ${message}`);
  };

  // Handlers para asignación de docentes y profesor jefe
  const handleOpenChangeHeadTeacher = () => {
    setTeacherModalMode("profesor_jefe");
    setTeacherModalCurrentDocId(profesorJefeId);
    setTeacherModalTargetId(resolvedCursoId);
    setTeacherModalTargetTitle(courseName);
    setTeacherModalCurrentIncidePromedio(true);
    setIsTeacherModalOpen(true);
  };

  const handleOpenAssignTeacher = (item: DbCursoAsignatura) => {
    setTeacherModalMode("asignatura");
    setTeacherModalCurrentDocId(item.docente_id ?? null);
    setTeacherModalTargetId(item.id);
    setTeacherModalTargetTitle(item.asignaturas.nombre);
    setTeacherModalCurrentIncidePromedio(item.incide_promedio !== false);
    setIsTeacherModalOpen(true);
  };

  const handleTeacherSuccess = (message: string) => {
    setActiveNotice(message);
    fetchSubjectsFromSupabase();
  };

  const handleTeacherError = (message: string) => {
    setActiveNotice(`Error: ${message}`);
  };

  // Estados para modal de agregar asignatura al curso (rol UTP)
  const [catalogAsignaturas, setCatalogAsignaturas] = useState<DbAsignatura[]>([]);
  const [isAddSubjectModalOpen, setIsAddSubjectModalOpen] = useState<boolean>(false);

  // Excluir asignaturas ya vinculadas al curso desde la interfaz
  const asignaturasDisponibles = React.useMemo(() => {
    const linkedIds = new Set(cursoAsignaturas.map((ca) => ca.asignatura_id));
    return catalogAsignaturas.filter((a) => !linkedIds.has(a.id));
  }, [catalogAsignaturas, cursoAsignaturas]);

  // Handlers para agregar asignatura al curso
  const handleOpenAddSubject = () => {
    fetchCatalogAsignaturas();
    setIsAddSubjectModalOpen(true);
  };

  const handleAddSubjectSuccess = (message: string) => {
    setActiveNotice(message);
    fetchSubjectsFromSupabase();
    fetchCatalogAsignaturas();
  };

  const handleAddSubjectError = (message: string) => {
    setActiveNotice(`Error: ${message}`);
  };

  // Permiso para ver el consolidado completo: UTP o Profesor Jefe del curso
  const isProfesorJefe =
    isDocente &&
    Boolean(profile?.docente_id) &&
    profile?.docente_id === profesorJefeId;
  const canViewConsolidated = isUtp || isProfesorJefe;

  // Función para consultar estudiantes del curso desde Supabase (Etapa 18B)
  const fetchStudentsFromSupabase = useCallback(
    async (targetCursoId?: number) => {
      const cursoId = targetCursoId ?? resolvedCursoId;

      if (!cursoId || cursoId <= 0) {
        setStudents([]);
        setIsLoadingStudents(false);
        return;
      }

      setIsLoadingStudents(true);
      setStudentsError(null);

      try {
        const { data, error } = await supabase
          .from("estudiantes")
          .select("id, numero_lista, nombres, apellidos, curso_id, activo, run, dv")
          .eq("curso_id", cursoId)
          .order("numero_lista", { ascending: true });

        if (error) {
          setStudentsError(`Error de Supabase: ${error.message}`);
          setStudents([]);
          return;
        }

        setStudents((data as DbStudent[]) || []);
      } catch (err: unknown) {
        setStudentsError(
          err instanceof Error
            ? `Error al conectar con la base de datos: ${err.message}`
            : "Error inesperado al conectar con Supabase."
        );
        setStudents([]);
      } finally {
        setIsLoadingStudents(false);
      }
    },
    [resolvedCursoId]
  );

  // Función para consultar curso, profesor jefe y asignaturas vinculadas desde Supabase
  const fetchSubjectsFromSupabase = useCallback(async () => {
    setIsLoadingSubjects(true);
    setSubjectsError(null);
    setIsLoadingHeadTeacher(true);

    try {
      const targetId = (courseId || course?.id || "").trim();
      let cursoData: (DbCurso & { docentes?: DbDocente | null }) | null = null;
      let cursoErr: { message: string } | null = null;

      const numId = parseInt(targetId, 10);
      const isNumeric = !isNaN(numId) && numId > 0 && String(numId) === targetId;

      if (isNumeric) {
        // A) Búsqueda directa por ID numérico: /cursos/1, /cursos/2
        const res = await supabase
          .from("cursos")
          .select("id, nombre, nivel, letra, anio, activo, profesor_jefe_id, docentes(id, nombres, apellidos)")
          .eq("id", numId)
          .maybeSingle();
        cursoData = res.data as unknown as (DbCurso & { docentes?: DbDocente | null });
        cursoErr = res.error;
      } else if (targetId) {
        // B) Compatibilidad con slug histórico o nombre: /cursos/7-basico-a
        const res = await supabase
          .from("cursos")
          .select("id, nombre, nivel, letra, anio, activo, profesor_jefe_id, docentes(id, nombres, apellidos)");

        if (res.error) {
          cursoErr = res.error;
        } else if (res.data && res.data.length > 0) {
          const match = res.data.find(
            (c) =>
              slugify(c.nombre) === targetId.toLowerCase() ||
              c.nombre.toLowerCase() === targetId.toLowerCase()
          );
          if (match) {
            cursoData = match as unknown as (DbCurso & { docentes?: DbDocente | null });
          }
        }
      }

      if (cursoErr) {
        setSubjectsError(`Error al consultar curso en Supabase: ${cursoErr.message}`);
        setCourseNotFound(true);
        setCursoAsignaturas([]);
        setHeadTeacher("Sin asignar");
        setProfesorJefeId(null);
        setResolvedCursoId(0);
        setStudents([]);
        setIsLoadingStudents(false);
        return;
      }

      if (!cursoData) {
        // Curso no encontrado o sin acceso
        setCourseNotFound(true);
        setCursoAsignaturas([]);
        setHeadTeacher("Sin asignar");
        setProfesorJefeId(null);
        setResolvedCursoId(0);
        setStudents([]);
        setIsLoadingStudents(false);
        return;
      }

      // Curso encontrado con éxito
      setCourseNotFound(false);
      setCourseName(cursoData.nombre);
      if (cursoData.nivel) setCourseNivel(cursoData.nivel);
      if (cursoData.letra) setCourseLetra(cursoData.letra);
      if (cursoData.anio) setCourseAnio(cursoData.anio);
      setCourseActivo(cursoData.activo === true);

      setProfesorJefeId(cursoData.profesor_jefe_id ?? null);
      const docenteData = cursoData.docentes;
      if (docenteData && docenteData.nombres && docenteData.apellidos) {
        setHeadTeacher(`Prof. ${docenteData.nombres} ${docenteData.apellidos}`.trim());
      } else if (cursoData.profesor_jefe_id) {
        // Fallback directo a la tabla docentes si la relación anidada viniera nula
        const { data: docData } = await supabase
          .from("docentes")
          .select("id, nombres, apellidos")
          .eq("id", cursoData.profesor_jefe_id)
          .maybeSingle();
        if (docData && docData.nombres && docData.apellidos) {
          setHeadTeacher(`Prof. ${docData.nombres} ${docData.apellidos}`.trim());
        } else {
          setHeadTeacher("Sin profesor(a) jefe asignado(a)");
        }
      } else {
        setHeadTeacher("Sin profesor(a) jefe asignado(a)");
      }

      const cursoIdNum = cursoData.id;
      setResolvedCursoId(cursoIdNum);

      // 2. Obtener las asignaturas vinculadas a ese curso mediante curso_asignaturas y sus docentes asociados
      const { data, error } = await supabase
        .from("curso_asignaturas")
        .select(
          "id, curso_id, asignatura_id, docente_id, incide_promedio, asignaturas(id, nombre, activo), docentes(id, nombres, apellidos, email, activo)"
        )
        .eq("curso_id", cursoIdNum)
        .order("asignatura_id", { ascending: true });

      if (error) {
        setSubjectsError(`Error al consultar curso_asignaturas en Supabase: ${error.message}`);
        setCursoAsignaturas([]);
        return;
      }

      // Filtrar y estructurar datos reales sin inventar ni duplicar respaldo
      let validRows = ((data || []) as unknown as DbCursoAsignatura[]).filter(
        (row) => row.asignaturas && row.asignaturas.nombre
      );

      // Si el usuario tiene rol docente, filtrar únicamente las asignaturas donde curso_asignaturas.docente_id === perfil.docente_id
      if (profile?.rol === "docente" && profile.docente_id) {
        validRows = validRows.filter((row) => row.docente_id === profile.docente_id);
      }

      setCursoAsignaturas(validRows);
    } catch (err: unknown) {
      setSubjectsError(
        err instanceof Error
          ? `Error al conectar con asignaturas: ${err.message}`
          : "Error inesperado al consultar asignaturas en Supabase."
      );
      setCourseNotFound(true);
      setCursoAsignaturas([]);
      setHeadTeacher("Sin profesor(a) jefe asignado(a)");
    } finally {
      setIsLoadingSubjects(false);
      setIsLoadingHeadTeacher(false);
    }
  }, [courseId, course?.id, profile]);

  // Función para obtener la lista de docentes activos desde Supabase (Rol UTP)
  const fetchActiveDocentes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("docentes")
        .select("id, nombres, apellidos, activo")
        .eq("activo", true)
        .order("apellidos", { ascending: true });

      if (!error && data) {
        setActiveDocentes(data as DbDocente[]);
      }
    } catch (err) {
      console.error("Error al cargar docentes activos:", err);
    }
  }, []);

  // Función para obtener el catálogo de asignaturas activas desde Supabase (Rol UTP)
  const fetchCatalogAsignaturas = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("asignaturas")
        .select("id, nombre, activo")
        .eq("activo", true)
        .order("nombre", { ascending: true });

      if (!error && data) {
        setCatalogAsignaturas(data as DbAsignatura[]);
      }
    } catch (err) {
      console.error("Error al cargar catálogo de asignaturas:", err);
    }
  }, []);

  // Limpiar nómina anterior y sincronizar ID numérico al cambiar de curso (Etapa 18B - Requisito 5)
  useEffect(() => {
    setStudents([]);
    setIsLoadingStudents(true);
    const newNumeric = Number(courseId || course?.id);
    if (!isNaN(newNumeric) && newNumeric > 0) {
      setResolvedCursoId(newNumeric);
    }
  }, [courseId, course?.id]);

  // Carga inicial de datos del curso, docentes y catálogo
  useEffect(() => {
    if (!authLoading) {
      fetchSubjectsFromSupabase();
      fetchActiveDocentes();
      fetchCatalogAsignaturas();
    }
  }, [authLoading, fetchSubjectsFromSupabase, fetchActiveDocentes, fetchCatalogAsignaturas]);

  // Carga y sincronización de estudiantes por curso resuelto (Etapa 18B)
  useEffect(() => {
    if (!authLoading && resolvedCursoId > 0) {
      fetchStudentsFromSupabase(resolvedCursoId);
    } else if (!authLoading && resolvedCursoId === 0 && courseNotFound) {
      setStudents([]);
      setIsLoadingStudents(false);
    }
  }, [authLoading, resolvedCursoId, fetchStudentsFromSupabase, courseNotFound]);

  // Vista institucional de carga mientras se valida la sesión o el curso
  if (authLoading || isLoadingSubjects) {
    return (
      <div className="min-h-screen flex bg-slate-50 text-slate-900">
        <Sidebar
          currentSection={currentSection}
          onSelectSection={(section) => setCurrentSection(section)}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
          <Header
            institution={institution}
            onOpenMobileSidebar={() => setIsMobileMenuOpen(true)}
          />
          <main className="flex-1 p-6 max-w-7xl w-full mx-auto flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Cargando información del curso...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Vista institucional cuando el curso no existe o el usuario no tiene acceso
  if (courseNotFound) {
    return (
      <div className="min-h-screen flex bg-slate-50 text-slate-900">
        <Sidebar
          currentSection={currentSection}
          onSelectSection={(section) => setCurrentSection(section)}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
          <Header
            institution={institution}
            onOpenMobileSidebar={() => setIsMobileMenuOpen(true)}
          />
          <main className="flex-1 p-6 max-w-7xl w-full mx-auto flex items-center justify-center">
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
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Curso no encontrado o sin acceso
                </h2>
                <p className="text-xs text-slate-500 mt-2">
                  El curso solicitado no existe en la plataforma o tu perfil no cuenta con los permisos necesarios para visualizarlo.
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
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Barra lateral izquierda idéntica al Panel UTP */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={(section) => setCurrentSection(section)}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Contenedor principal */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        {/* Cabecera institucional */}
        <Header
          institution={institution}
          onOpenMobileSidebar={() => setIsMobileMenuOpen(true)}
        />

        {/* Notificación flotante informativa cuando se hace clic en acciones en desarrollo */}
        {activeNotice && (
          <div className="fixed top-20 right-4 z-50 max-w-md bg-blue-950 text-white px-4 py-3 rounded-xl shadow-lg border border-blue-800 flex items-center gap-3 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-blue-800 flex items-center justify-center shrink-0 text-blue-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-xs">
              <p className="font-semibold text-blue-200">Aviso informativo</p>
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

        {/* Contenido principal del curso */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
          {/* Navegación de migas de pan (Breadcrumb) y botón Volver */}
          <nav aria-label="Breadcrumb" className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link href="/" className="hover:text-blue-900 font-medium transition-colors">
                {isDocente ? "Panel Docente" : "Panel UTP"}
              </Link>
              <span>/</span>
              <span className="text-slate-400">Cursos</span>
              <span>/</span>
              <span className="text-slate-900 font-semibold">{courseName}</span>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver al Panel</span>
            </Link>
          </nav>

          {/* Tarjeta de encabezado del curso */}
          <section className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-900 text-white flex flex-col items-center justify-center font-bold shadow-sm shrink-0">
                  <span className="text-xs uppercase font-semibold text-blue-200">
                    {(courseName.match(/^[0-9]+[°º]/)?.[0]) || (courseName.split(" ")[0] ?? "")}
                  </span>
                  <span className="text-xl font-extrabold leading-none">
                    {courseLetra || (courseName.match(/\b([A-Za-z])\b$/)?.[1] ?? "")}
                  </span>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {courseName}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                      {courseNivel}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                        courseActivo
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {courseActivo ? "Periodo Abierto" : "Curso Inactivo"}
                    </span>

                    {/* Botón Editar curso visible solo para UTP */}
                    {isUtp && (
                      <button
                        type="button"
                        onClick={() => setIsCursoEditModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-bold shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer ml-1"
                        title="Editar datos básicos del curso"
                      >
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>Editar curso</span>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-600">
                    <span>
                      Profesor(a) Jefe:{" "}
                      <strong className="text-slate-800 font-semibold">
                        {isLoadingHeadTeacher ? "Cargando..." : (headTeacher || "Sin profesor(a) jefe asignado(a)")}
                      </strong>
                    </span>
                    {isUtp && (
                      <button
                        type="button"
                        onClick={handleOpenChangeHeadTeacher}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-semibold shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
                        title="Cambiar profesor jefe del curso"
                      >
                        <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>Cambiar</span>
                      </button>
                    )}
                    <span className="text-slate-400">·</span>
                    <span>Sala {course?.room || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Ficha institucional de período del curso */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200/80">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Año escolar
                  </span>
                  <span className="text-base font-extrabold text-slate-900">
                    {courseAnio}
                  </span>
                </div>

                <div className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200/80">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Periodo activo
                  </span>
                  <span className="text-base font-extrabold text-slate-900">
                    {course?.period || "Segundo semestre"}
                  </span>
                </div>
              </div>
            </div>

            {/* Métricas rápidas del curso */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-100">
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                <span className="text-[11px] text-slate-500 font-medium uppercase block">Estudiantes</span>
                <span className="text-lg font-bold text-slate-900">
                  {isLoadingStudents ? (
                    <span className="text-slate-400 text-sm font-normal">Consultando...</span>
                  ) : studentsError ? (
                    <span className="text-rose-600 text-sm font-semibold">Error al cargar</span>
                  ) : (
                    `${students.length} matriculados`
                  )}
                </span>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                <span className="text-[11px] text-slate-500 font-medium uppercase block">Asignaturas</span>
                <span className="text-lg font-bold text-slate-900">
                  {isLoadingSubjects ? (
                    <span className="text-slate-400 text-sm font-normal">Consultando...</span>
                  ) : subjectsError ? (
                    <span className="text-rose-600 text-sm font-semibold">Error</span>
                  ) : (
                    `${cursoAsignaturas.length} en plan de estudio`
                  )}
                </span>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                <span className="text-[11px] text-slate-500 font-medium uppercase block">Régimen</span>
                <span className="text-lg font-bold text-slate-900">Semestral</span>
              </div>
              <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                <span className="text-[11px] text-slate-500 font-medium uppercase block">Libreta de Notas</span>
                <span className="text-lg font-bold text-emerald-700">En proceso</span>
              </div>
            </div>
          </section>

          {/* SECCIÓN 4: ASIGNATURAS (Obtenidas directamente desde Supabase vía curso_asignaturas) */}
          <section aria-labelledby="seccion-asignaturas" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 id="seccion-asignaturas" className="text-xl font-bold text-slate-900 tracking-tight">
                    Asignaturas
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-900">
                    {isLoadingSubjects
                      ? "Cargando..."
                      : subjectsError
                      ? "Error"
                      : `${cursoAsignaturas.length} asignadas`}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Plan curricular para {courseName} en el {course?.period || "Segundo semestre"} {courseAnio}.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isUtp && (
                  <button
                    type="button"
                    onClick={handleOpenAddSubject}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>+ Agregar asignatura</span>
                  </button>
                )}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Origen: Supabase (curso_asignaturas)
                </span>
              </div>
            </div>

            {/* Estado de carga para Asignaturas */}
            {isLoadingSubjects && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 animate-pulse"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 w-3/4">
                        <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                        <div className="h-5 bg-slate-200 rounded w-3/4"></div>
                      </div>
                      <div className="w-9 h-9 bg-slate-100 rounded-lg"></div>
                    </div>
                    <div className="space-y-2 pt-2">
                      <div className="h-3 bg-slate-100 rounded"></div>
                      <div className="h-3 bg-slate-100 rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Estado de Error para Asignaturas */}
            {!isLoadingSubjects && subjectsError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center text-rose-900 shadow-2xs">
                <div className="w-10 h-10 rounded-full bg-rose-100 border border-rose-300 mx-auto flex items-center justify-center text-rose-700 font-bold mb-2">
                  !
                </div>
                <h4 className="font-bold text-sm text-rose-900">
                  No se pudieron cargar las asignaturas desde Supabase
                </h4>
                <p className="text-xs text-rose-700 mt-1 max-w-md mx-auto">
                  {subjectsError}
                </p>
                <button
                  type="button"
                  onClick={fetchSubjectsFromSupabase}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white rounded-lg shadow-xs transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Reintentar conexión</span>
                </button>
              </div>
            )}

            {/* Estado cuando Supabase devuelve cero asignaturas asociadas */}
            {!isLoadingSubjects && !subjectsError && cursoAsignaturas.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-10 text-center text-slate-500">
                <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 mx-auto flex items-center justify-center text-slate-400 mb-3">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h4 className="font-bold text-sm text-slate-800">
                  No hay asignaturas registradas para este curso
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  La tabla &quot;curso_asignaturas&quot; en Supabase no tiene asignaturas vinculadas a este curso.
                </p>
              </div>
            )}

            {/* Listado de tarjetas de asignaturas obtenidas desde Supabase */}
            {!isLoadingSubjects && !subjectsError && cursoAsignaturas.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cursoAsignaturas.map((item) => {
                  const subjectName = item.asignaturas.nombre;
                  const subjectId = item.asignatura_id;
                  const teacher = getTeacherDisplay(item);

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs hover:border-blue-300 hover:shadow-sm transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              {item.incide_promedio === false && (
                                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  No incide en promedio general
                                </span>
                              )}
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-200">
                                ID #{subjectId}
                              </span>
                            </div>
                            <h4 className="text-lg font-bold text-slate-900 tracking-tight">
                              {subjectName}
                            </h4>
                          </div>
                          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-900 shrink-0">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 text-xs">
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500 font-medium">Docente a cargo:</span>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800">{teacher}</span>
                              {isUtp && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAssignTeacher(item)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-[11px] font-semibold shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
                                  title={item.docente_id ? "Reasignar docente" : "Asignar docente"}
                                >
                                  <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  <span>{item.docente_id ? "Reasignar" : "Asignar docente"}</span>
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                            <span className="text-slate-500 font-medium">Evaluaciones del periodo:</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-blue-950 bg-blue-50 border border-blue-200">
                              3 evaluaciones
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Botón Ingresar notas con ID real de Supabase */}
                      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          Escala 1.0 a 7.0
                        </span>
                        <Link
                          href={`/cursos/${courseId || course?.id || resolvedCursoId}/asignaturas/${item.asignatura_id}`}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Ingresar notas</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SECCIÓN 5: ESTUDIANTES (Obtenida directamente desde Supabase) */}
          <section aria-labelledby="seccion-estudiantes" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 id="seccion-estudiantes" className="text-xl font-bold text-slate-900 tracking-tight">
                    Nómina de Estudiantes
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                    {isLoadingStudents
                      ? "Cargando..."
                      : studentsError
                      ? "Error"
                      : `${students.length} alumnos`}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Estudiantes matriculados oficialmente en {courseName} (Año {courseAnio}).
                </p>
              </div>

              <div className="flex items-center gap-2">
                {canViewConsolidated && (
                  <Link
                    href={`/cursos/${courseId || course?.id || resolvedCursoId}/libretas`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-900 bg-white hover:bg-blue-50 text-blue-900 text-xs font-bold shadow-2xs transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                      />
                    </svg>
                    <span>Imprimir libretas del curso</span>
                  </Link>
                )}
                {isUtp && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsSigeImportModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-900 bg-white hover:bg-blue-50 text-blue-900 text-xs font-semibold tracking-wide transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span>Importar desde SIGE</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCreateStudent}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>+ Nuevo estudiante</span>
                    </button>
                  </>
                )}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Origen: Supabase
                </span>
                <span className="text-xs text-slate-500 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  Orden por N.° de lista
                </span>
              </div>
            </div>

            {/* Estado de Carga Visual */}
            {isLoadingStudents && (
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-8 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-900 animate-spin">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  Consultando nómina de estudiantes en Supabase...
                </p>
                <div className="max-w-md mx-auto space-y-2 pt-2">
                  <div className="h-3 bg-slate-100 rounded-full animate-pulse"></div>
                  <div className="h-3 bg-slate-100 rounded-full animate-pulse w-5/6 mx-auto"></div>
                </div>
              </div>
            )}

            {/* Estado de Error de Conexión (Sin inventar datos de respaldo) */}
            {!isLoadingStudents && studentsError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center text-rose-900 shadow-2xs">
                <div className="w-10 h-10 rounded-full bg-rose-100 border border-rose-300 mx-auto flex items-center justify-center text-rose-700 font-bold mb-2">
                  !
                </div>
                <h4 className="font-bold text-sm text-rose-900">
                  No se pudo cargar la nómina desde Supabase
                </h4>
                <p className="text-xs text-rose-700 mt-1 max-w-md mx-auto">
                  {studentsError}
                </p>
                <button
                  type="button"
                  onClick={() => fetchStudentsFromSupabase(resolvedCursoId)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white rounded-lg shadow-xs transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Reintentar conexión</span>
                </button>
              </div>
            )}

            {/* Estado cuando Supabase devuelve cero estudiantes */}
            {!isLoadingStudents && !studentsError && students.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-10 text-center text-slate-500">
                <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 mx-auto flex items-center justify-center text-slate-400 mb-3">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h4 className="font-bold text-sm text-slate-800">
                  No hay estudiantes registrados
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  La tabla &quot;estudiantes&quot; en Supabase no contiene registros para este curso en este momento.
                </p>
              </div>
            )}

            {/* Tabla con los estudiantes recuperados desde Supabase */}
            {!isLoadingStudents && !studentsError && students.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#0f2942] text-white text-xs font-semibold tracking-wider uppercase">
                      <tr>
                        <th scope="col" className="px-4 py-3.5 w-20 text-center">
                          N° Lista
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Nombre Completo
                        </th>
                        <th scope="col" className="px-6 py-3.5 text-center">
                          Estado Matrícula
                        </th>
                        {(canViewConsolidated || isUtp) && (
                          <th scope="col" className="px-6 py-3.5 text-right">
                            Acciones
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((student) => {
                        const fullName = `${student.nombres} ${student.apellidos}`;
                        const initialLetter = student.nombres ? student.nombres.charAt(0) : "E";
                        const isStudentActive = student.activo !== false;

                        return (
                          <tr
                            key={student.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 font-bold text-slate-700 text-xs">
                                {student.numero_lista}
                              </span>
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-900 shrink-0">
                                  {initialLetter}
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-900 block">
                                    {fullName}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    ID Supabase: #{student.id}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              {isStudentActive ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Regular
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  Inactivo
                                </span>
                              )}
                            </td>
                            {(canViewConsolidated || isUtp) && (
                              <td className="px-6 py-3.5 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  {isUtp && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditStudent(student)}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-semibold shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
                                      title="Editar datos del estudiante"
                                    >
                                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                      <span>Editar</span>
                                    </button>
                                  )}
                                  {canViewConsolidated && (
                                    <>
                                      <Link
                                        href={`/cursos/${courseId || course?.id || resolvedCursoId}/estudiantes/${student.id}`}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-900 text-xs font-semibold shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-900"
                                        title="Ver consolidado de notas"
                                      >
                                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span>Consolidado</span>
                                      </Link>
                                      <Link
                                        href={`/cursos/${courseId || course?.id || resolvedCursoId}/estudiantes/${student.id}/libreta`}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-blue-900 bg-blue-50/50 hover:bg-blue-100 text-blue-900 text-xs font-bold shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-900"
                                        title="Ver e imprimir libreta individual oficial de notas"
                                      >
                                        <svg className="w-3.5 h-3.5 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                                          />
                                        </svg>
                                        <span>Libreta</span>
                                      </Link>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </main>

        {/* Pie de página institucional */}
        <footer className="mt-auto border-t border-slate-200/80 bg-white py-4 px-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>
              © 2026 {institution.schoolName} — Todos los derechos reservados.
            </span>
            <span className="text-slate-400">
              {institution.systemName} · {courseName}
            </span>
          </div>
        </footer>
      </div>

      {/* Modal administrativo para Crear y Editar Estudiantes (UTP) */}
      <StudentAdminModal
        isOpen={isStudentModalOpen}
        onClose={() => setIsStudentModalOpen(false)}
        cursoId={resolvedCursoId}
        studentToEdit={studentToEdit}
        onSuccess={handleStudentSuccess}
        onError={handleStudentError}
      />

      {/* Modal administrativo para Asignar Docentes y Cambiar Profesor Jefe (UTP) */}
      <TeacherAssignmentModal
        isOpen={isTeacherModalOpen}
        mode={teacherModalMode}
        docentes={activeDocentes}
        currentDocenteId={teacherModalCurrentDocId}
        targetId={teacherModalTargetId}
        targetTitle={teacherModalTargetTitle}
        currentIncidePromedio={teacherModalCurrentIncidePromedio}
        onClose={() => setIsTeacherModalOpen(false)}
        onSuccess={handleTeacherSuccess}
        onError={handleTeacherError}
      />

      {/* Modal administrativo para Editar Curso (UTP) */}
      <CursoModal
        isOpen={isCursoEditModalOpen}
        cursoToEdit={{
          id: resolvedCursoId,
          nombre: courseName,
          nivel: courseNivel,
          letra: courseLetra,
          anio: courseAnio,
          activo: courseActivo,
        }}
        onClose={() => setIsCursoEditModalOpen(false)}
        onSuccess={(msg) => {
          setActiveNotice(msg);
          fetchSubjectsFromSupabase();
        }}
        onError={(msg) => {
          setActiveNotice(`Error: ${msg}`);
        }}
      />

      {/* Modal administrativo para Agregar Asignatura al Curso (UTP) */}
      <AddSubjectToCourseModal
        isOpen={isAddSubjectModalOpen}
        courseId={resolvedCursoId}
        asignaturasDisponibles={asignaturasDisponibles}
        docentes={activeDocentes}
        onClose={() => setIsAddSubjectModalOpen(false)}
        onSuccess={handleAddSubjectSuccess}
        onError={handleAddSubjectError}
      />

      {/* Modal administrativo para Importar Nómina desde SIGE (UTP) */}
      <SigeImportModal
        isOpen={isSigeImportModalOpen}
        onClose={() => setIsSigeImportModalOpen(false)}
        cursoId={resolvedCursoId}
        cursoNombre={courseName}
        cursoNivel={courseNivel}
        cursoLetra={courseLetra}
        cursoAnio={courseAnio}
        existingStudents={students}
        onSuccess={(msg) => {
          setActiveNotice(msg);
          fetchStudentsFromSupabase(resolvedCursoId);
        }}
        onError={(msg) => {
          setActiveNotice(`Error: ${msg}`);
        }}
      />
    </div>
  );
}
