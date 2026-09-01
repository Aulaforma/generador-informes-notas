/**
 * js/db.js
 * Capa de datos relacional en memoria persistida en LocalStorage.
 * Administra entidades: Institución, Niveles, Asignaturas por Curso, Estudiantes, Calificaciones y Asistencia.
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
    COURSE_SUBJECTS: 'laa_course_subjects',
    COURSES: 'laa_courses',
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
    return Math.round((num + Number.EPSILON) * 10) / 10;
  }

  function formatGrade(val) {
    const rounded = roundToChileanGrade(val);
    if (rounded === null) return '-';
    return rounded.toFixed(1).replace('.', ',');
  }

  /**
   * Conversión a escala conceptual oficial:
   * Notas de 1.0 a 3.9: I (Insuficiente)
   * Notas de 4.0 a 4.9: S (Suficiente)
   * Notas de 5.0 a 5.9: B (Bien)
   * Notas de 6.0 a 7.0: MB (Muy Bien)
   */
  function convertToConcept(val) {
    if (val === null || val === undefined || isNaN(val) || val === '') return '-';
    const num = roundToChileanGrade(val);
    if (num === null || num < 1.0) return '-';
    if (num < 4.0) return 'I';
    if (num < 5.0) return 'S';
    if (num < 6.0) return 'B';
    return 'MB';
  }

  function getConceptDescription(concept) {
    switch (String(concept || '').toUpperCase().trim()) {
      case 'I': return 'Insuficiente (1,0 a 3,9)';
      case 'S': return 'Suficiente (4,0 a 4,9)';
      case 'B': return 'Bien (5,0 a 5,9)';
      case 'MB': return 'Muy Bien (6,0 a 7,0)';
      default: return '';
    }
  }

  function getConceptBadgeClass(concept) {
    switch (String(concept || '').toUpperCase().trim()) {
      case 'I': return 'concept-insuficiente';
      case 'S': return 'concept-suficiente';
      case 'B': return 'concept-bien';
      case 'MB': return 'concept-muybien';
      default: return '';
    }
  }

  /**
   * Detecta si una asignatura por su nombre suele ser conceptual (Orientación o Religión)
   */
  function isTypicallyConceptual(name) {
    const clean = String(name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return clean.includes('orientacion') || clean.includes('religion');
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
      if (!localStorage.getItem(DB_KEYS.COURSE_SUBJECTS)) {
        localStorage.setItem(DB_KEYS.COURSE_SUBJECTS, JSON.stringify({}));
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

    // --- GESTIÓN DINÁMICA DE CURSOS Y PROFESORES JEFE ---
    getCourses() {
      try {
        let courses = JSON.parse(localStorage.getItem(DB_KEYS.COURSES));
        if (!courses || courses.length === 0) {
          courses = [
            { id: 'cur_p1a', nombre: 'Primero Básico A', profesorJefe: 'Prof. Carmen Gloria Muñoz', orden: 1 },
            { id: 'cur_m1a', nombre: 'Primero Medio A', profesorJefe: 'Prof. Alejandro Valenzuela', orden: 2 }
          ];
          localStorage.setItem(DB_KEYS.COURSES, JSON.stringify(courses));
        }
        return courses.sort((a, b) => (a.orden || 0) - (b.orden || 0));
      } catch (e) {
        return [];
      }
    }

    getCourseNames() {
      return this.getCourses().map(c => c.nombre);
    }

    getCourseById(id) {
      return this.getCourses().find(c => c.id === id) || null;
    }

    getCourseByName(nombre) {
      if (!nombre) return null;
      const clean = nombre.trim().toLowerCase();
      return this.getCourses().find(c => c.nombre.trim().toLowerCase() === clean) || null;
    }

    saveCourse(courseData) {
      const courses = this.getCourses();
      const nombre = (courseData.nombre || '').trim();
      const profesorJefe = (courseData.profesorJefe || '').trim();

      if (!nombre) return null;

      let saved = null;
      if (courseData.id) {
        const idx = courses.findIndex(c => c.id === courseData.id);
        if (idx !== -1) {
          const oldName = courses[idx].nombre;
          courses[idx] = {
            ...courses[idx],
            nombre,
            profesorJefe
          };
          saved = courses[idx];

          if (oldName && oldName !== nombre) {
            this.renameCourseReferences(oldName, nombre);
          }
        }
      } else {
        const existing = courses.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
        if (existing) {
          existing.profesorJefe = profesorJefe || existing.profesorJefe;
          saved = existing;
        } else {
          saved = {
            id: 'cur_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            nombre,
            profesorJefe,
            orden: courses.length + 1
          };
          courses.push(saved);
        }
      }

      localStorage.setItem(DB_KEYS.COURSES, JSON.stringify(courses));
      window.dispatchEvent(new CustomEvent('courses_updated', { detail: saved }));
      return saved;
    }

    deleteCourse(courseId) {
      const courses = this.getCourses();
      const course = courses.find(c => c.id === courseId);
      if (!course) return;

      const filtered = courses.filter(c => c.id !== courseId);
      filtered.forEach((c, idx) => { c.orden = idx + 1; });
      localStorage.setItem(DB_KEYS.COURSES, JSON.stringify(filtered));
      window.dispatchEvent(new CustomEvent('courses_updated', { detail: { deletedId: courseId, nombre: course.nombre } }));
    }

    renameCourseReferences(oldName, newName) {
      const students = this.getStudents();
      let updatedStudents = false;
      students.forEach(st => {
        if (st.nivel === oldName) {
          st.nivel = newName;
          updatedStudents = true;
        }
      });
      if (updatedStudents) {
        localStorage.setItem(DB_KEYS.STUDENTS, JSON.stringify(students));
      }

      const subjectsMap = this.getAllCourseSubjectsMap();
      if (subjectsMap[oldName]) {
        subjectsMap[newName] = subjectsMap[oldName];
        delete subjectsMap[oldName];
        localStorage.setItem(DB_KEYS.COURSE_SUBJECTS, JSON.stringify(subjectsMap));
      }
    }

    loadOfficialCoursesCatalog() {
      const currentCourses = this.getCourses();
      const existingNames = new Set(currentCourses.map(c => c.nombre.toLowerCase()));

      NIVELES_DISPONIBLES.forEach((n, idx) => {
        if (!existingNames.has(n.toLowerCase())) {
          currentCourses.push({
            id: 'cur_cat_' + (idx + 1),
            nombre: n,
            profesorJefe: '',
            orden: currentCourses.length + 1
          });
        }
      });

      localStorage.setItem(DB_KEYS.COURSES, JSON.stringify(currentCourses));
      window.dispatchEvent(new CustomEvent('courses_updated', { detail: { loadedCatalog: true } }));
      return currentCourses.length;
    }

    getProfesorJefeForCourse(nivel) {
      if (!nivel) return 'Profesor(a) Jefe';
      const course = this.getCourseByName(nivel);
      if (course && course.profesorJefe && course.profesorJefe.trim()) {
        return course.profesorJefe.trim();
      }
      const config = this.getConfig();
      const map = config.profesoresJefe || {};
      return (map[nivel] && map[nivel].trim()) ? map[nivel].trim() : (config.profesorJefe || 'Profesor(a) Jefe');
    }

    saveProfesorJefeForCourse(nivel, nombre) {
      const course = this.getCourseByName(nivel);
      if (course) {
        course.profesorJefe = (nombre || '').trim();
        return this.saveCourse(course);
      }
      const config = this.getConfig();
      if (!config.profesoresJefe) config.profesoresJefe = {};
      config.profesoresJefe[nivel] = (nombre || '').trim();
      return this.saveConfig(config);
    }

    saveAllProfesoresJefe(map) {
      const courses = this.getCourses();
      let modified = false;

      Object.keys(map).forEach(nivel => {
        const c = courses.find(item => item.nombre.toLowerCase() === nivel.toLowerCase());
        if (c) {
          c.profesorJefe = (map[nivel] || '').trim();
          modified = true;
        }
      });

      if (modified) {
        localStorage.setItem(DB_KEYS.COURSES, JSON.stringify(courses));
        window.dispatchEvent(new CustomEvent('courses_updated', { detail: map }));
      }

      const config = this.getConfig();
      config.profesoresJefe = { ...(config.profesoresJefe || {}), ...map };
      return this.saveConfig(config);
    }

    // --- ASIGNATURAS POR CURSO (GESTIÓN PERSONALIZADA) ---
    getAllCourseSubjectsMap() {
      try {
        return JSON.parse(localStorage.getItem(DB_KEYS.COURSE_SUBJECTS)) || {};
      } catch (e) {
        return {};
      }
    }

    getSubjectsForCourse(nivel) {
      const map = this.getAllCourseSubjectsMap();
      const list = map[nivel] || [];
      // Ordenar por campo 'orden'
      return list.sort((a, b) => (a.orden || 0) - (b.orden || 0));
    }

    saveSubjectForCourse(nivel, subjectData) {
      const map = this.getAllCourseSubjectsMap();
      if (!map[nivel]) map[nivel] = [];

      const list = map[nivel];
      let saved;

      const incide = subjectData.incideEnPromedio !== undefined ? Boolean(subjectData.incideEnPromedio) : true;
      const conceptual = subjectData.esConceptual !== undefined 
        ? Boolean(subjectData.esConceptual) 
        : isTypicallyConceptual(subjectData.nombre);

      if (subjectData.id) {
        const idx = list.findIndex(s => s.id === subjectData.id);
        if (idx !== -1) {
          list[idx] = {
            ...list[idx],
            nombre: subjectData.nombre.trim(),
            incideEnPromedio: incide,
            esConceptual: conceptual
          };
          saved = list[idx];
        } else {
          saved = {
            id: subjectData.id,
            nombre: subjectData.nombre.trim(),
            incideEnPromedio: incide,
            esConceptual: conceptual,
            orden: list.length + 1
          };
          list.push(saved);
        }
      } else {
        saved = {
          id: 'asg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          nombre: subjectData.nombre.trim(),
          incideEnPromedio: incide,
          esConceptual: conceptual,
          orden: list.length + 1
        };
        list.push(saved);
      }

      map[nivel] = list;
      localStorage.setItem(DB_KEYS.COURSE_SUBJECTS, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('subjects_updated', { detail: { nivel, subject: saved } }));
      return saved;
    }

    deleteSubjectForCourse(nivel, subjectId) {
      const map = this.getAllCourseSubjectsMap();
      if (!map[nivel]) return;

      map[nivel] = map[nivel].filter(s => s.id !== subjectId);
      // Reindexar orden
      map[nivel].forEach((s, idx) => { s.orden = idx + 1; });

      localStorage.setItem(DB_KEYS.COURSE_SUBJECTS, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('subjects_updated', { detail: { nivel, deletedId: subjectId } }));
    }

    reorderCourseSubjects(nivel, subjectIds) {
      const map = this.getAllCourseSubjectsMap();
      if (!map[nivel]) return;

      const subjectMap = new Map(map[nivel].map(s => [s.id, s]));
      const reordered = [];

      subjectIds.forEach((id, idx) => {
        if (subjectMap.has(id)) {
          const s = subjectMap.get(id);
          s.orden = idx + 1;
          reordered.push(s);
        }
      });

      map[nivel] = reordered;
      localStorage.setItem(DB_KEYS.COURSE_SUBJECTS, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('subjects_updated', { detail: { nivel } }));
    }

    copySubjectsBetweenCourses(fromNivel, toNivel) {
      const sourceList = this.getSubjectsForCourse(fromNivel);
      if (sourceList.length === 0) return 0;

      const map = this.getAllCourseSubjectsMap();
      map[toNivel] = sourceList.map((s, idx) => ({
        id: 'asg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6) + '_' + idx,
        nombre: s.nombre,
        incideEnPromedio: s.incideEnPromedio,
        esConceptual: s.esConceptual,
        orden: idx + 1
      }));

      localStorage.setItem(DB_KEYS.COURSE_SUBJECTS, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('subjects_updated', { detail: { nivel: toNivel } }));
      return map[toNivel].length;
    }

    // --- ESTUDIANTES ---
    getStudents(filterNivel = null) {
      try {
        const data = JSON.parse(localStorage.getItem(DB_KEYS.STUDENTS)) || [];
        let students = filterNivel ? data.filter(s => s.nivel === filterNivel) : data;
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
     * Calcula el Promedio General del Estudiante:
     * REGLA CLAVE: Solo considera asignaturas que INCIDEN en el promedio final (incideEnPromedio: true)
     * y que utilizan escala numérica (no conceptuales como Orientación o Religión).
     */
    getStudentGeneralAverage(studentId) {
      const student = this.getStudentById(studentId);
      if (!student) return null;

      const courseSubjects = this.getSubjectsForCourse(student.nivel);
      // Mapa de asignaturas que inciden en el promedio
      const incidentSubjectsMap = new Map();
      
      if (courseSubjects && courseSubjects.length > 0) {
        courseSubjects.forEach(s => {
          // Solo incide si incideEnPromedio !== false y no es conceptual
          if (s.incideEnPromedio !== false && !s.esConceptual) {
            incidentSubjectsMap.set(s.nombre, true);
          }
        });
      }

      const studentGrades = this.getGradesByStudent(studentId);
      
      const promedios = studentGrades
        .filter(g => {
          // Si hay configuración de curso, verificar que incida
          if (incidentSubjectsMap.size > 0) {
            return incidentSubjectsMap.has(g.subject);
          }
          // Si no hay configuración de curso aún, excluir las típicamente conceptuales
          return !isTypicallyConceptual(g.subject);
        })
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
        version: '1.2',
        timestamp: new Date().toISOString(),
        config: this.getConfig(),
        courseSubjects: this.getAllCourseSubjectsMap(),
        students: this.getStudents(),
        grades: this.getAllGrades(),
        attendance: this.getAllAttendance()
      };
    }

    importBackup(backupData) {
      if (!backupData) return false;
      if (backupData.config) localStorage.setItem(DB_KEYS.CONFIG, JSON.stringify(backupData.config));
      if (backupData.courseSubjects) localStorage.setItem(DB_KEYS.COURSE_SUBJECTS, JSON.stringify(backupData.courseSubjects));
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
    roundToChileanGrade,
    formatGrade,
    convertToConcept,
    getConceptDescription,
    getConceptBadgeClass,
    isTypicallyConceptual,
    EducationalDB,
    db
  };
});
