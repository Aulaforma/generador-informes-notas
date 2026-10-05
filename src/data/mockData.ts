import {
  InstitutionalInfo,
  MetricCardData,
  CourseData,
  Student,
  Subject,
  SubjectGradesData,
} from "@/types/dashboard";

export const institutionalData: InstitutionalInfo = {
  schoolName: "Liceo Andrés Alcázar de Tucapel",
  systemName: "Libreta de Notas",
  schoolYear: 2026,
  period: "Segundo semestre",
  role: "Panel UTP",
};

export const metricsData: MetricCardData[] = [
  {
    id: "cursos",
    title: "Cursos",
    value: 1,
    subtitle: "Curso activo en el periodo lectivo",
    iconName: "courses",
  },
  {
    id: "estudiantes",
    title: "Estudiantes",
    value: 10,
    subtitle: "Total alumnos matriculados",
    iconName: "students",
  },
  {
    id: "docentes",
    title: "Docentes",
    value: 4,
    subtitle: "Profesores asignados a asignaturas",
    iconName: "teachers",
  },
  {
    id: "periodo",
    title: "Periodo",
    value: "Abierto",
    subtitle: "Segundo semestre · Año 2026",
    badge: {
      text: "Activo",
      variant: "success",
    },
    iconName: "period",
  },
];

export const sampleSubjects: Subject[] = [
  {
    id: "lenguaje",
    name: "Lenguaje y Comunicación",
    teacher: "Prof. Marcela Soto",
    evaluationsCount: 3,
  },
  {
    id: "matematica",
    name: "Matemática",
    teacher: "Prof. Rodrigo Alarcón",
    evaluationsCount: 3,
  },
  {
    id: "historia",
    name: "Historia, Geografía y Ciencias Sociales",
    teacher: "Prof. Patricio Rivas",
    evaluationsCount: 3,
  },
  {
    id: "ciencias",
    name: "Ciencias Naturales",
    teacher: "Prof. Andrea Fuentes",
    evaluationsCount: 3,
  },
];

export const sampleStudents: Student[] = [
  { listNumber: 1, fullName: "Aguilar Castillo, Matías Ignacio" },
  { listNumber: 2, fullName: "Benítez Morales, Sofía Valentina" },
  { listNumber: 3, fullName: "Carrasco Fuenzalida, Lucas Benjamín" },
  { listNumber: 4, fullName: "Díaz Henríquez, Florencia Isidora" },
  { listNumber: 5, fullName: "Espinoza Valenzuela, Joaquín Alonso" },
  { listNumber: 6, fullName: "Fuentes Miranda, Martina Paz" },
  { listNumber: 7, fullName: "González Parra, Vicente Andrés" },
  { listNumber: 8, fullName: "Herrera Lagos, Catalina Belén" },
  { listNumber: 9, fullName: "Iturra Sepúlveda, Tomás Gabriel" },
  { listNumber: 10, fullName: "Jorquera Reyes, Emilia Francisca" },
];

export const sampleCourses: CourseData[] = [
  {
    id: "7-basico-a",
    grade: "7° Básico",
    section: "A",
    fullTitle: "7° Básico A",
    level: "Educación Básica",
    schoolYear: 2026,
    period: "Segundo semestre",
    studentCount: 10,
    subjectCount: 4,
    headTeacher: "Sin asignar",
    room: "12",
    subjects: sampleSubjects,
    students: sampleStudents,
  },
];

// Calificaciones iniciales por asignatura y estudiante (escala chilena 1,0 a 7,0)
export const initialGradesData: SubjectGradesData = {
  lenguaje: {
    1: ["6,2", "5,8", "6,5"],
    2: ["5,5", "6,0", "5,9"],
    3: ["4,8", "5,2", "4,5"],
    4: ["6,8", "7,0", "6,5"],
    5: ["5,0", "4,5", "5,2"],
    6: ["6,0", "6,4", "6,8"],
    7: ["3,8", "4,2", "4,0"],
    8: ["6,5", "6,2", "6,7"],
    9: ["5,2", "5,0", ""],
    10: ["5,9", "6,1", "6,0"],
  },
  matematica: {
    1: ["5,5", "6,0", "5,8"],
    2: ["6,2", "6,5", "6,0"],
    3: ["4,0", "4,5", "3,8"],
    4: ["6,5", "6,8", "7,0"],
    5: ["4,2", "5,0", "4,6"],
    6: ["5,8", "6,0", "6,2"],
    7: ["3,5", "4,0", "4,2"],
    8: ["6,0", "6,4", "6,5"],
    9: ["4,8", "5,2", ""],
    10: ["6,0", "5,8", "6,3"],
  },
  historia: {
    1: ["6,0", "6,5", "6,2"],
    2: ["5,8", "6,2", "6,0"],
    3: ["5,0", "4,8", "5,2"],
    4: ["7,0", "6,8", "6,9"],
    5: ["4,6", "5,0", "4,8"],
    6: ["6,2", "6,5", "6,7"],
    7: ["4,0", "4,5", "4,2"],
    8: ["6,8", "6,5", "6,6"],
    9: ["5,5", "5,2", ""],
    10: ["6,2", "6,0", "6,4"],
  },
  ciencias: {
    1: ["5,8", "6,2", "6,0"],
    2: ["6,0", "6,3", "6,5"],
    3: ["4,5", "4,8", "4,2"],
    4: ["6,7", "6,9", "7,0"],
    5: ["4,8", "5,1", "5,0"],
    6: ["6,4", "6,2", "6,6"],
    7: ["3,9", "4,1", "4,5"],
    8: ["6,3", "6,6", "6,5"],
    9: ["5,0", "5,4", ""],
    10: ["6,1", "6,4", "6,2"],
  },
};
