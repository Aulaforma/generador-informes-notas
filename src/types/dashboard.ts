export interface InstitutionalInfo {
  schoolName: string;
  systemName: string;
  schoolYear: number;
  period: string;
  role: string;
}

export interface MetricCardData {
  id: string;
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: {
    text: string;
    variant: "success" | "info" | "neutral";
  };
  iconName: "courses" | "students" | "teachers" | "period";
}

export interface Subject {
  id: string;
  name: string;
  teacher: string;
  evaluationsCount: number;
}

export interface Student {
  listNumber: number;
  fullName: string;
}

export interface DbStudent {
  id: number;
  numero_lista: number;
  nombres: string;
  apellidos: string;
  curso_id: number;
  activo: boolean;
}

export interface DbAsignatura {
  id: number;
  nombre: string;
  activo?: boolean;
}

export interface DbDocente {
  id: number;
  nombres: string;
  apellidos: string;
  email?: string;
  activo?: boolean;
}

export interface DbCursoAsignatura {
  id: number;
  curso_id: number;
  asignatura_id: number;
  docente_id?: number | null;
  asignaturas: DbAsignatura;
  docentes?: DbDocente | null;
}

export interface DbCurso {
  id: number;
  nombre: string;
  nivel?: string;
  letra?: string;
  anio?: number;
  activo?: boolean;
  profesor_jefe_id?: number | null;
  docentes?: DbDocente | null;
}

export interface DbEvaluacion {
  id: number;
  curso_asignatura_id: number;
  nombre: string;
  periodo: number;
  orden: number;
  fecha?: string | null;
  created_at?: string;
}

export interface DbCalificacion {
  id: number;
  estudiante_id: number;
  evaluacion_id: number;
  nota: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbPeriodo {
  id: number;
  numero: number;
  nombre: string;
  anio: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  activo: boolean;
  cerrado: boolean;
  created_at?: string;
}

export interface CourseData {
  id: string;
  grade: string;
  section: string;
  fullTitle: string;
  level: string;
  schoolYear: number;
  period: string;
  studentCount: number;
  subjectCount: number;
  headTeacher: string;
  room: string;
  subjects: Subject[];
  students: Student[];
}

export type NavSection =
  | "inicio"
  | "cursos"
  | "estudiantes"
  | "asignaturas"
  | "docentes"
  | "periodos"
  | "libretas"
  | "configuracion";

export interface SubjectGradesData {
  [subjectId: string]: {
    [studentListNumber: number]: string[];
  };
}

export interface DbPerfil {
  id: string;
  nombre: string;
  rol: string;
  docente_id: number | null;
  activo: boolean;
}

