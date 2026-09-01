/**
 * js/db.js
 * Capa de datos relacional en memoria persistida en LocalStorage.
 * Administra entidades: Institución, Niveles, Asignaturas, Estudiantes, Calificaciones y Asistencia.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    Object.assign(root, exports);
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const DB_KEYS = {
    CONFIG: 'laa_school_config',
    STUDENTS: 'laa_students',
    GRADES: 'laa_grades',
    ATTENDANCE: 'laa_attendance',
    INITIALIZED: 'laa_db_initialized'
  };

  // Catálogo oficial de niveles según requerimiento
  const NIVELES_DISPONIBLES = [
    'Transición 1',
    'Transición 2',
    'Primero Básico A',
    'Primero Básico B',
    'Segundo Básico A',
    'Segundo Básico B',
    'Tercero Básico A',
    'Tercero Básico B',
    'Cuarto Básico A',
    'Cuarto Básico B',
    'Quinto Básico A',
    'Quinto Básico B',
    'Sexto Básico A',
    'Sexto Básico B',
    'Séptimo Básico A',
    'Séptimo Básico B',
    'Octavo Básico A',
    'Octavo Básico B',
    'Primero Medio A',
    'Primero Medio B',
    'Segundo Medio A',
    'Segundo Medio B',
    'Tercero Medio A',
    'Tercero Medio B',
    'Cuarto Medio A',
    'Cuarto Medio B',
    'Curso Laboral'
  ];

  // Asignaturas estándar del currículum escolar (hasta 18 asignaturas para el informe)
  const ASIGNATURAS_CATALOGO = [
    'Lenguaje y Comunicación / Literatura',
    'Matemática',
    'Ciencias Naturales (Biología/Física/Química)',
    'Historia, Geografía y Ciencias Sociales',
    'Idioma Extranjero: Inglés',
    'Educación Física y Salud',
    'Artes Visuales',
    'Música',
    'Tecnología',
    'Orientación',
    'Religión',
    'Filosofía',
    'Educación Ciudadana',
    'Taller de Expresión Artística',
    'Taller de Comprensión Lectora',
    'Taller de Razonamiento Matemático',
    'Taller de Vida Activa y Salud',
    'Especialidad Técnico-Profesional / Laboral'
  ];

  /**
   * Regla de redondeo de notas:
   * "los promedios siempre van con dos decimales en donde corre la aproximación entre ellos
   * por ejemplo: 6,57 = 6,6. igual y superior a 5 en el segundo decimal aproxima,
   * otro ejemplo: 6,44=6,4."
   */
  function roundToChileanGrade(val) {
    if (val === null || val === undefined || isNaN(val) || val === '') return null;
    const num = Number(val);
    if (isNaN(num)) return null;
    // Redondeo al primer decimal a partir del segundo decimal (>= 5 aproxima hacia arriba)
    return Math.round((num + Number.EPSILON) * 10) / 10;
  }

  function formatGrade(val) {
    const rounded = roundToChileanGrade(val);
    if (rounded === null) return '-';
    return rounded.toFixed(1).replace('.', ',');
  }

  class EducationalDB {
    constructor() {
      this.init();
    }

    init() {
      if (!localStorage.getItem(DB_KEYS.CONFIG)) {
        const defaultConfig = {
          nombre: 'Liceo Andrés Alcázar de Tucapel',
          rbd: '4580-1',
          logo: './assets/default_badge.svg',
          anioEscolar: '2026',
          comuna: 'Tucapel',
          region: 'Región del Biobío',
          director: 'Director(a) Establecimiento',
          profesorJefe: 'Profesor(a) Jefe'
        };
        this.saveConfig(defaultConfig);
      }

      if (!localStorage.getItem(DB_KEYS.STUDENTS)) {
        localStorage.setItem(DB_KEYS.STUDENTS, JSON.stringify([]));
      }
      if (!localStorage.getItem(DB_KEYS.GRADES)) {
        localStorage.setItem(DB_KEYS.GRADES, JSON.stringify([]));
      }
      if (!localStorage.getItem(DB_KEYS.ATTENDANCE)) {
        localStorage.setItem(DB_KEYS.ATTENDANCE, JSON.stringify([]));
      }
    }

    // --- CONFIGURACIÓN INSTITUCIONAL ---
    getConfig() {
      try {
        return JSON.parse(localStorage.getItem(DB_KEYS.CONFIG)) || {};
      } catch (e) {
        console.error('Error al leer configuración institucional:', e);
        return {};
      }
    }

    saveConfig(configData) {
      const current = this.getConfig();
      const updated = { ...current, ...configData };
      localStorage.setItem(DB_KEYS.CONFIG, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('school_config_updated', { detail: updated }));
      return updated;
    }

    // --- ESTUDIANTES ---
    getStudents(filterNivel = null) {
      try {
        const data = JSON.parse(localStorage.getItem(DB_KEYS.STUDENTS)) || [];
        let students = filterNivel ? data.filter(s => s.nivel === filterNivel) : data;
        // Ordenar alfabéticamente por Apellido Paterno, Apellido Materno y Nombres
        return students.sort((a, b) => {
          const apA = `${a.apellidoPaterno || ''} ${a.apellidoMaterno || ''} ${a.nombres || ''}`.trim().toLowerCase();
          const apB = `${b.apellidoPaterno || ''} ${b.apellidoMaterno || ''} ${b.nombres || ''}`.trim().toLowerCase();
          return apA.localeCompare(apB, 'es', { sensitivity: 'base' });
        });
      } catch (e) {
        console.error('Error al obtener estudiantes:', e);
        return [];
      }
    }

    getStudentById(id) {
      const students = this.getStudents();
      return students.find(s => s.id === id) || null;
    }

    saveStudent(student) {
      const students = this.getStudents();
      let saved;
      if (student.id) {
        const idx = students.findIndex(s => s.id === student.id);
        if (idx !== -1) {
          students[idx] = { ...students[idx], ...student };
          saved = students[idx];
        } else {
          students.push(student);
          saved = student;
        }
      } else {
        saved = {
          ...student,
          id: 'std_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
        };
        students.push(saved);
      }
      localStorage.setItem(DB_KEYS.STUDENTS, JSON.stringify(students));
      window.dispatchEvent(new CustomEvent('students_updated', { detail: saved }));
      return saved;
    }

    deleteStudent(id) {
      const students = this.getStudents().filter(s => s.id !== id);
      localStorage.setItem(DB_KEYS.STUDENTS, JSON.stringify(students));
      // Cascada: Eliminar calificaciones y asistencia del alumno
      this.deleteGradesByStudent(id);
      this.deleteAttendanceByStudent(id);
      window.dispatchEvent(new CustomEvent('students_updated', { detail: { deletedId: id } }));
    }

    // --- CALIFICACIONES (12 NOTAS POR ASIGNATURA) ---
    getAllGrades() {
      try {
        return JSON.parse(localStorage.getItem(DB_KEYS.GRADES)) || [];
      } catch (e) {
        return [];
      }
    }

    getGradesByStudent(studentId) {
      return this.getAllGrades().filter(g => g.studentId === studentId);
    }

    getGradesForStudentAndSubject(studentId, subject) {
      const all = this.getAllGrades();
      return all.find(g => g.studentId === studentId && g.subject === subject) || null;
    }

    saveStudentGrades(studentId, subject, notesArray) {
      const allGrades = this.getAllGrades();
      const idx = allGrades.findIndex(g => g.studentId === studentId && g.subject === subject);

      // Calcular promedio del alumno en la asignatura
      const validNotes = notesArray
        .map(n => (n !== null && n !== undefined && n !== '' ? parseFloat(String(n).replace(',', '.')) : null))
        .filter(n => n !== null && !isNaN(n) && n >= 1.0 && n <= 7.0);

      let promedio = null;
      if (validNotes.length > 0) {
        const sum = validNotes.reduce((acc, val) => acc + val, 0);
        const rawAvg = sum / validNotes.length;
        promedio = roundToChileanGrade(rawAvg);
      }

      const record = {
        id: idx !== -1 ? allGrades[idx].id : 'grd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        studentId,
        subject,
        notes: notesArray,
        promedio
      };

      if (idx !== -1) {
        allGrades[idx] = record;
      } else {
        allGrades.push(record);
      }

      localStorage.setItem(DB_KEYS.GRADES, JSON.stringify(allGrades));
      return record;
    }

    deleteGradesByStudent(studentId) {
      const filtered = this.getAllGrades().filter(g => g.studentId !== studentId);
      localStorage.setItem(DB_KEYS.GRADES, JSON.stringify(filtered));
    }

    /**
     * Calcula dinámicamente el Promedio General del Curso para una asignatura específica:
     * Suma de los promedios individuales dividida por la cantidad de alumnos evaluados.
     */
    getCourseSubjectAverage(nivel, subject) {
      const students = this.getStudents(nivel);
      if (!students || students.length === 0) return null;

      const studentIds = new Set(students.map(s => s.id));
      const allGrades = this.getAllGrades().filter(g => studentIds.has(g.studentId) && g.subject === subject);

      const promediosConNota = allGrades
        .map(g => g.promedio)
        .filter(p => p !== null && !isNaN(p));

      if (promediosConNota.length === 0) return null;

      const sum = promediosConNota.reduce((acc, val) => acc + val, 0);
      const rawCourseAvg = sum / promediosConNota.length;
      return roundToChileanGrade(rawCourseAvg);
    }

    /**
     * Calcula el Promedio General del Estudiante (todas las asignaturas que tienen promedio)
     */
    getStudentGeneralAverage(studentId) {
      const studentGrades = this.getGradesByStudent(studentId);
      const promedios = studentGrades
        .map(g => g.promedio)
        .filter(p => p !== null && !isNaN(p));

      if (promedios.length === 0) return null;
      const sum = promedios.reduce((acc, val) => acc + val, 0);
      return roundToChileanGrade(sum / promedios.length);
    }

    // --- ASISTENCIA ---
    getAllAttendance() {
      try {
        return JSON.parse(localStorage.getItem(DB_KEYS.ATTENDANCE)) || [];
      } catch (e) {
        return [];
      }
    }

    getAttendanceByStudent(studentId) {
      return this.getAllAttendance().find(a => a.studentId === studentId) || null;
    }

    saveStudentAttendance(studentId, nivel, diasTrabajados, diasAsistidos) {
      const all = this.getAllAttendance();
      const idx = all.findIndex(a => a.studentId === studentId);

      const trab = Number(diasTrabajados) || 0;
      const asist = Number(diasAsistidos) || 0;
      let porcentaje = 0;
      if (trab > 0) {
        porcentaje = Math.min(100, Math.round(((asist / trab) * 100 + Number.EPSILON) * 10) / 10);
      }

      const record = {
        id: idx !== -1 ? all[idx].id : 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        studentId,
        nivel,
        diasTrabajados: trab,
        diasAsistidos: asist,
        porcentaje
      };

      if (idx !== -1) {
        all[idx] = record;
      } else {
        all.push(record);
      }

      localStorage.setItem(DB_KEYS.ATTENDANCE, JSON.stringify(all));
      return record;
    }

    deleteAttendanceByStudent(studentId) {
      const filtered = this.getAllAttendance().filter(a => a.studentId !== studentId);
      localStorage.setItem(DB_KEYS.ATTENDANCE, JSON.stringify(filtered));
    }

    // --- UTILIDADES ---
    isInitialized() {
      return localStorage.getItem(DB_KEYS.INITIALIZED) === 'true';
    }

    markInitialized() {
      localStorage.setItem(DB_KEYS.INITIALIZED, 'true');
    }

    exportBackup() {
      return {
        version: '1.0',
        timestamp: new Date().toISOString(),
        config: this.getConfig(),
        students: this.getStudents(),
        grades: this.getAllGrades(),
        attendance: this.getAllAttendance()
      };
    }

    importBackup(backupData) {
      if (!backupData) return false;
      if (backupData.config) localStorage.setItem(DB_KEYS.CONFIG, JSON.stringify(backupData.config));
      if (backupData.students) localStorage.setItem(DB_KEYS.STUDENTS, JSON.stringify(backupData.students));
      if (backupData.grades) localStorage.setItem(DB_KEYS.GRADES, JSON.stringify(backupData.grades));
      if (backupData.attendance) localStorage.setItem(DB_KEYS.ATTENDANCE, JSON.stringify(backupData.attendance));
      window.location.reload();
      return true;
    }
  }

  const db = new EducationalDB();

  return {
    NIVELES_DISPONIBLES,
    ASIGNATURAS_CATALOGO,
    roundToChileanGrade,
    formatGrade,
    EducationalDB,
    db
  };
});
