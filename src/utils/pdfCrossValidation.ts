import { areCoursesEquivalent } from "./sigeParser";

export interface SystemCourse {
  id: number;
  nombre: string;
  nivel?: string;
  letra?: string;
}

export interface SystemCourseSubject {
  id: number; // curso_asignatura_id
  curso_id: number;
  asignatura_id: number;
  incide_promedio?: boolean;
  asignaturas: {
    id: number;
    nombre: string;
    activo?: boolean;
  };
}

export interface SystemStudentMatch {
  id: number;
  nombres: string;
  apellidos: string;
  run?: number | null;
  dv?: string | null;
  curso_id: number;
  activo: boolean;
  cursos?: SystemCourse | null;
}

export type StudentMatchStatus = "ENCONTRADO" | "REVISAR" | "ERROR";
export type CourseMatchStatus = "COINCIDE" | "NO_COINCIDE" | "ERROR";
export type SubjectMatchStatus = "VINCULADA" | "MANUAL" | "CONCEPTUAL_OMITIDA";

// Estados por nota individual (Requisito 5)
export type GradePositionStatus = "NUEVA" | "DUPLICADO" | "CONFLICTO" | "EVALUACION_FALTANTE";

// Estados generales del PDF (Requisito 9)
export type OverallPdfStatus = "LISTO_PARA_IMPORTAR" | "REVISAR" | "DUPLICADO" | "ERROR" | "PDF_SIN_TEXTO";

export interface GradePositionItem {
  posicion: number; // 1, 2, 3... (Nota 1, Nota 2)
  notaPdf: number;
  evaluacionExistenteId: number | null;
  evaluacionExistenteNombre: string | null;
  orden: number;
  calificacionExistenteId: number | null;
  calificacionExistenteValor: number | null;
  status: GradePositionStatus;
  statusMessage: string;
}

export interface SubjectComparisonItem {
  asignaturaPdf: string;
  notasPeriodo1: number[];
  promedioInformado: number | null;
  isConceptual: boolean;
  conceptualNotas?: string[];
  // Datos del sistema
  cursoAsignaturaId: number | null;
  asignaturaSistemaId: number | null;
  asignaturaSistemaNombre: string | null;
  status: SubjectMatchStatus;
  statusMessage: string;
  // Sugerencia
  sugerenciaId?: number | null;
  // Detalle por posiciones de notas (Etapa 19D)
  gradesAnalysis: GradePositionItem[];
}

export interface ValidatedPdfReport {
  fileName: string;
  fileSize: number;
  overallStatus: OverallPdfStatus;
  statusMessage: string;

  // Datos del estudiante
  estudiantePdf: string;
  runPdf: number | null;
  dvPdf: string | null;
  rawRunPdf: string;

  studentMatchStatus: StudentMatchStatus;
  systemStudent: SystemStudentMatch | null;

  // Datos del curso
  cursoPdf: string;
  cursoPdfNormalizado: string;
  courseMatchStatus: CourseMatchStatus;
  systemCourse: SystemCourse | null;

  // Asignaturas y notas
  subjects: SubjectComparisonItem[];
  availableCourseSubjects: SystemCourseSubject[];
  totalNotasPeriodo1: number;

  // Resumen de notas y evaluaciones (Requisito 8)
  notasNuevasCount: number;
  notasDuplicadasCount: number;
  notasConflictosCount: number;
  evaluacionesFaltantesCount: number;
}

/**
 * Normaliza nombres para comparación de cadenas flexibles:
 * - Minúsculas
 * - Quitar tildes/diacríticos
 * - Quitar puntuaciones y caracteres no alfanuméricos
 * - Colapsar espacios
 */
export function normalizeSubjectString(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:,;\-_*()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Diccionario de alias inicial para sugerencias comunes entre informes antiguos y el catálogo actual.
 * Claves en minúsculas y normalizadas.
 */
const SUBJECT_ALIASES: Record<string, string[]> = {
  // Lenguaje
  "lengua y literatura": ["lenguaje y comunicacion", "lengua castellana", "lenguaje", "lengua y literatura"],
  "lenguaje y comunicacio": ["lenguaje y comunicacion", "lengua y literatura", "lenguaje"],
  "lenguaje y comunicacion": ["lengua y literatura", "lenguaje"],
  "lectura y escritura esp": ["lectura y escritura especializadas", "taller de literatura", "lenguaje"],

  // Inglés
  "idioma extranjero ingl": ["idioma extranjero: ingles", "ingles", "idioma extranjero ingles"],
  "idioma extranjero ingles": ["ingles", "idioma extranjero: ingles"],
  "ingles social comunica": ["ingles", "ingles social comunicativo"],

  // Matemáticas
  "matematica": ["matematicas", "educacion matematica"],
  "matematicas": ["matematica"],

  // Ciencias Naturales
  "ciencias naturales": ["ciencias para la ciudadania", "biologia", "quimica", "fisica"],
  "ciencias para la ciudad": ["ciencias para la ciudadania", "ciencias naturales"],
  "ciencias para la ciudadania": ["ciencias naturales"],
  "biologia de los ecosis": ["biologia de los ecosistemas", "biologia", "ciencias naturales"],
  "ciencias de la salud": ["ciencias para la ciudadania", "biologia"],
  "ciencias aplicadas": ["ciencias para la ciudadania", "ciencias"],

  // Historia y Ciencias Sociales
  "historia geografia y": ["historia, geografia y ciencias sociales", "historia y geografia", "historia"],
  "historia geografia y ciencias sociales": ["historia y geografia", "historia"],
  "historia y cultura loca": ["historia y cultura local", "historia"],
  "educacion ciudadana": ["educacion ciudadana", "historia"],
  "geografia territorio": ["geografia, territorio y desafios socioambientales", "geografia"],

  // Educación Física
  "educacion fisica y sa": ["educacion fisica y salud", "educacion fisica"],
  "educacion fisica y salud": ["educacion fisica"],
  "educacion fisica": ["educacion fisica y salud"],

  // Artes
  "artes": ["artes visuales", "artes plasticas"],
  "artes visuales": ["artes", "artes plasticas"],
  "musica": ["artes musicales", "educacion musical"],
  "artes musicales": ["musica"],
  "lenguaje artistico": ["artes visuales", "musica", "lenguaje artistico"],

  // Tecnología
  "tecnologia": ["educacion tecnologica", "tecnologia"],
  "educacion tecnologica": ["tecnologia"],

  // Filosofía
  "filosofia": ["filosofia y psicologia", "filosofia"],

  // Religión
  "religion catolica": ["religion", "religion catolica"],
  "religion evangelica": ["religion", "religion evangelica"],
  "religion": ["religion catolica", "religion evangelica"],
};

/**
 * Busca coincidencia entre una asignatura del PDF y la lista de asignaturas del curso en el sistema.
 * Retorna { matchedSubject, isExact, isSuggested }
 */
export function matchSubjectToCourse(
  rawPdfSubject: string,
  courseSubjects: SystemCourseSubject[]
): {
  matchedSubject: SystemCourseSubject | null;
  isExact: boolean;
  isSuggested: boolean;
} {
  const normPdf = normalizeSubjectString(rawPdfSubject);
  if (!normPdf || courseSubjects.length === 0) {
    return { matchedSubject: null, isExact: false, isSuggested: false };
  }

  // 1. Coincidencia exacta normalizada
  for (const cs of courseSubjects) {
    const normSys = normalizeSubjectString(cs.asignaturas.nombre);
    if (normPdf === normSys) {
      return { matchedSubject: cs, isExact: true, isSuggested: false };
    }
  }

  // 2. Coincidencia por contención fuerte (ej. "Lenguaje y Comunicació" contenido en "Lenguaje y Comunicación")
  for (const cs of courseSubjects) {
    const normSys = normalizeSubjectString(cs.asignaturas.nombre);
    if (
      (normPdf.length >= 6 && normSys.startsWith(normPdf)) ||
      (normSys.length >= 6 && normPdf.startsWith(normSys))
    ) {
      return { matchedSubject: cs, isExact: true, isSuggested: false };
    }
  }

  // 3. Coincidencia a través del diccionario de alias
  const aliases = SUBJECT_ALIASES[normPdf] || [];
  for (const cs of courseSubjects) {
    const normSys = normalizeSubjectString(cs.asignaturas.nombre);
    if (aliases.some((alias) => normalizeSubjectString(alias) === normSys || normSys.includes(normalizeSubjectString(alias)))) {
      return { matchedSubject: cs, isExact: false, isSuggested: true };
    }
  }

  return { matchedSubject: null, isExact: false, isSuggested: false };
}

/**
 * Evalúa si el curso del PDF coincide con el curso del sistema usando areCoursesEquivalent.
 */
export function compareCourses(
  cursoPdf: string,
  systemCourse: SystemCourse | null
): CourseMatchStatus {
  if (!systemCourse) return "NO_COINCIDE";
  const equivalent = areCoursesEquivalent(
    { nombre: cursoPdf },
    {
      nombre: systemCourse.nombre,
      nivel: systemCourse.nivel,
      letra: systemCourse.letra,
    }
  );
  return equivalent ? "COINCIDE" : "NO_COINCIDE";
}

export interface RawEvaluation {
  id: number;
  curso_asignatura_id: number;
  nombre: string;
  orden: number;
  periodo: number;
}

export interface RawCalificacion {
  id: number;
  estudiante_id: number;
  evaluacion_id: number;
  nota: number | string | null;
}

/**
 * Cruza las notas numéricas del Periodo 1 de cada asignatura del PDF con las evaluaciones
 * y calificaciones existentes en Supabase para el estudiante.
 *
 * Mapeo posicional:
 * Posición 1 (Nota 1) -> orden 1
 * Posición 2 (Nota 2) -> orden 2
 * ...
 *
 * Estados por nota:
 * - NUEVA: Existe evaluación pero no calificación del estudiante.
 * - DUPLICADO: Existe calificación con el mismo valor numérico.
 * - CONFLICTO: Existe calificación con valor numérico diferente.
 * - EVALUACION_FALTANTE: No existe evaluación con ese orden para curso_asignatura_id + periodo 1.
 */
export function computeGradesAnalysis(
  subjects: SubjectComparisonItem[],
  evaluaciones: RawEvaluation[],
  calificaciones: RawCalificacion[]
): {
  updatedSubjects: SubjectComparisonItem[];
  notasNuevasCount: number;
  notasDuplicadasCount: number;
  notasConflictosCount: number;
  evaluacionesFaltantesCount: number;
} {
  // Construir índices para búsqueda O(1)
  // evalMap: "cursoAsignaturaId_orden" -> RawEvaluation
  const evalMap = new Map<string, RawEvaluation>();
  for (const ev of evaluaciones) {
    if (ev.periodo === 1) {
      evalMap.set(`${ev.curso_asignatura_id}_${ev.orden}`, ev);
    }
  }

  // califMap: "evaluacionId" -> RawCalificacion
  const califMap = new Map<number, RawCalificacion>();
  for (const cal of calificaciones) {
    califMap.set(cal.evaluacion_id, cal);
  }

  let totalNuevas = 0;
  let totalDuplicadas = 0;
  let totalConflictos = 0;
  let totalFaltantes = 0;

  const updatedSubjects = subjects.map((sub) => {
    // Si es conceptual o no está vinculada a un curso_asignatura_id, no analizamos notas
    if (sub.isConceptual || !sub.cursoAsignaturaId || sub.notasPeriodo1.length === 0) {
      return {
        ...sub,
        gradesAnalysis: [],
      };
    }

    const caId = sub.cursoAsignaturaId;
    const gradesAnalysis: GradePositionItem[] = sub.notasPeriodo1.map((notaPdf, idx) => {
      const posicion = idx + 1; // 1, 2, 3...
      const orden = posicion;
      const key = `${caId}_${orden}`;
      const foundEval = evalMap.get(key);

      if (!foundEval) {
        totalFaltantes++;
        return {
          posicion,
          notaPdf,
          evaluacionExistenteId: null,
          evaluacionExistenteNombre: null,
          orden,
          calificacionExistenteId: null,
          calificacionExistenteValor: null,
          status: "EVALUACION_FALTANTE" as GradePositionStatus,
          statusMessage: "Evaluación faltante en sistema (se creará histórica al importar)",
        };
      }

      // Evaluación existe en orden N
      const foundCalif = califMap.get(foundEval.id);
      const rawGradeVal = foundCalif?.nota;
      const hasGradeVal = rawGradeVal !== null && rawGradeVal !== undefined && rawGradeVal !== "";

      if (!hasGradeVal) {
        totalNuevas++;
        return {
          posicion,
          notaPdf,
          evaluacionExistenteId: foundEval.id,
          evaluacionExistenteNombre: foundEval.nombre,
          orden,
          calificacionExistenteId: null,
          calificacionExistenteValor: null,
          status: "NUEVA" as GradePositionStatus,
          statusMessage: "No existe calificación (lista para importar)",
        };
      }

      const numCalif = typeof rawGradeVal === "number" ? rawGradeVal : parseFloat(String(rawGradeVal));

      // Comparación con tolerancia a decimales (ej. 5.6 vs 5.60)
      if (Math.abs(numCalif - notaPdf) < 0.05) {
        totalDuplicadas++;
        return {
          posicion,
          notaPdf,
          evaluacionExistenteId: foundEval.id,
          evaluacionExistenteNombre: foundEval.nombre,
          orden,
          calificacionExistenteId: foundCalif?.id ?? null,
          calificacionExistenteValor: numCalif,
          status: "DUPLICADO" as GradePositionStatus,
          statusMessage: "Existe calificación con exactamente el mismo valor",
        };
      } else {
        totalConflictos++;
        return {
          posicion,
          notaPdf,
          evaluacionExistenteId: foundEval.id,
          evaluacionExistenteNombre: foundEval.nombre,
          orden,
          calificacionExistenteId: foundCalif?.id ?? null,
          calificacionExistenteValor: numCalif,
          status: "CONFLICTO" as GradePositionStatus,
          statusMessage: `Conflicto: sistema tiene ${numCalif.toFixed(1)}, PDF tiene ${notaPdf.toFixed(1)}`,
        };
      }
    });

    return {
      ...sub,
      gradesAnalysis,
    };
  });

  return {
    updatedSubjects,
    notasNuevasCount: totalNuevas,
    notasDuplicadasCount: totalDuplicadas,
    notasConflictosCount: totalConflictos,
    evaluacionesFaltantesCount: totalFaltantes,
  };
}

/**
 * Determina el estado general del PDF según las reglas de negocio de la Etapa 19D:
 * - LISTO_PARA_IMPORTAR: Estudiante coincide, curso coincide, asignaturas vinculadas, sin conflictos.
 * - REVISAR: Hay conflicto de notas, asignatura requiere selección manual, o curso presenta discrepancia.
 * - DUPLICADO: Si todas las notas del PDF ya existen con el mismo valor.
 * - ERROR: Problemas estructurales reales (estudiante no encontrado, etc.).
 */
export function computeOverallPdfStatus(params: {
  studentMatchStatus: StudentMatchStatus;
  courseMatchStatus: CourseMatchStatus;
  subjects: SubjectComparisonItem[];
  notasNuevasCount: number;
  notasDuplicadasCount: number;
  notasConflictosCount: number;
  evaluacionesFaltantesCount: number;
  systemCourseName?: string;
  cursoPdf?: string;
}): { overallStatus: OverallPdfStatus; statusMessage: string } {
  const {
    studentMatchStatus,
    courseMatchStatus,
    subjects,
    notasNuevasCount,
    notasDuplicadasCount,
    notasConflictosCount,
    evaluacionesFaltantesCount,
    systemCourseName,
    cursoPdf,
  } = params;

  // 1. Error estructural de estudiante
  if (studentMatchStatus === "ERROR") {
    return {
      overallStatus: "ERROR",
      statusMessage: "El estudiante no fue encontrado en la nómina del establecimiento.",
    };
  }

  // 2. Estudiante requiere revisión
  if (studentMatchStatus === "REVISAR") {
    return {
      overallStatus: "REVISAR",
      statusMessage: "El RUN no arrojó coincidencia exacta en Supabase.",
    };
  }

  // 3. Discrepancia de curso
  if (courseMatchStatus === "NO_COINCIDE") {
    return {
      overallStatus: "REVISAR",
      statusMessage: `Discrepancia en curso: PDF indica "${cursoPdf || "—"}", sistema registra "${systemCourseName || "Sin curso"}".`,
    };
  }

  // 4. Asignatura requiere selección manual
  const hasUnlinkedNumericSubjects = subjects.some(
    (s) => !s.isConceptual && s.notasPeriodo1.length > 0 && s.status === "MANUAL"
  );
  if (hasUnlinkedNumericSubjects) {
    return {
      overallStatus: "REVISAR",
      statusMessage: "Existen asignaturas con notas pendientes de vinculación manual.",
    };
  }

  // 5. Conflicto de notas
  if (notasConflictosCount > 0) {
    return {
      overallStatus: "REVISAR",
      statusMessage: `Conflicto detectado: ${notasConflictosCount} nota(s) tienen valores distintos a los ya registrados en el sistema.`,
    };
  }

  // 6. Todas las notas ya son duplicados
  const totalGrades = notasNuevasCount + notasDuplicadasCount + notasConflictosCount + evaluacionesFaltantesCount;
  if (totalGrades > 0 && notasDuplicadasCount === totalGrades) {
    return {
      overallStatus: "DUPLICADO",
      statusMessage: "Todas las notas del informe ya existen en el sistema con el mismo valor.",
    };
  }

  // 7. Todo validado y listo para importar
  return {
    overallStatus: "LISTO_PARA_IMPORTAR",
    statusMessage: "Listo para importar: estudiante, curso y asignaturas validadas sin conflictos.",
  };
}
