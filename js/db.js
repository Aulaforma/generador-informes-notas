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

  // Catálogo Oficial de Asignaturas y Códigos SIGE - MINEDUC
  const CATALOGO_SIGE = [
    // 1. Plan Común
    { codigo: '110', nombre: 'Idioma Extranjero: Inglés', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '120', nombre: 'Lengua Castellana y Comunicación / Lengua y Literatura', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '130', nombre: 'Educación Matemática / Matemática', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '140', nombre: 'Ciencias Naturales (Educación Básica)', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '141', nombre: 'Biología', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '142', nombre: 'Física', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '143', nombre: 'Química', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '150', nombre: 'Historia, Geografía y Ciencias Sociales', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '152', nombre: 'Educación Ciudadana (Plan común 3° y 4° Medio)', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '160', nombre: 'Artes Visuales', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '170', nombre: 'Artes Musicales / Música', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '180', nombre: 'Educación Física y Salud', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '190', nombre: 'Tecnología / Educación Tecnológica', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },
    { codigo: '200', nombre: 'Orientación', categoria: 'Plan Común (SIGE)', incide: false, conceptual: true },
    { codigo: '210', nombre: 'Religión (Católica, Evangélica, etc.)', categoria: 'Plan Común (SIGE)', incide: false, conceptual: true },
    { codigo: '220', nombre: 'Filosofía (Plan común 3° y 4° Medio)', categoria: 'Plan Común (SIGE)', incide: true, conceptual: false },

    // 2. Modalidad Humanista-Científica (HC) - Área A (Letras / Historia / Filosofía)
    { codigo: '315', nombre: 'Taller de Literatura', categoria: 'Electivos HC - Área A', incide: true, conceptual: false },
    { codigo: '315', nombre: 'Lectura y Escritura Especializadas', categoria: 'Electivos HC - Área A', incide: true, conceptual: false },
    { codigo: '315', nombre: 'Argumentación y Participación en Democracia', categoria: 'Electivos HC - Área A', incide: true, conceptual: false },
    { codigo: '316', nombre: 'Comprensión Histórica del Presente', categoria: 'Electivos HC - Área A', incide: true, conceptual: false },
    { codigo: '316', nombre: 'Geografía, Territorio y Desafíos Socioambientales', categoria: 'Electivos HC - Área A', incide: true, conceptual: false },
    { codigo: '317', nombre: 'Estética', categoria: 'Electivos HC - Área A', incide: true, conceptual: false },

    // 3. Modalidad Humanista-Científica (HC) - Área B (Matemática / Ciencias)
    { codigo: '325', nombre: 'Límites, Derivadas e Integrales', categoria: 'Electivos HC - Área B', incide: true, conceptual: false },
    { codigo: '325', nombre: 'Estocástica', categoria: 'Electivos HC - Área B', incide: true, conceptual: false },
    { codigo: '325', nombre: 'Pensamiento Computacional y Programación', categoria: 'Electivos HC - Área B', incide: true, conceptual: false },
    { codigo: '325', nombre: 'Geometría 3D', categoria: 'Electivos HC - Área B', incide: true, conceptual: false },
    { codigo: '326', nombre: 'Biología de los Ecosistemas', categoria: 'Electivos HC - Área B', incide: true, conceptual: false },
    { codigo: '326', nombre: 'Célula, Genoma y Organismo', categoria: 'Electivos HC - Área B', incide: true, conceptual: false },
    { codigo: '327', nombre: 'Física de Partículas / Mecánica', categoria: 'Electivos HC - Área B', incide: true, conceptual: false },
    { codigo: '328', nombre: 'Química del Entorno', categoria: 'Electivos HC - Área B', incide: true, conceptual: false },

    // 4. Modalidad Humanista-Científica (HC) - Área C (Artes / Ed. Física)
    { codigo: '335', nombre: 'Artes Visuales, Audiovisuales y Mediales', categoria: 'Electivos HC - Área C', incide: true, conceptual: false },
    { codigo: '335', nombre: 'Interpretación y Creación en Música', categoria: 'Electivos HC - Área C', incide: true, conceptual: false },
    { codigo: '335', nombre: 'Diseño y Arquitectura', categoria: 'Electivos HC - Área C', incide: true, conceptual: false },
    { codigo: '336', nombre: 'Promoción de Estilos de Vida Activos y Saludables', categoria: 'Electivos HC - Área C', incide: true, conceptual: false },
    { codigo: '336', nombre: 'Ciencias del Ejercicio Físico y Deportivo', categoria: 'Electivos HC - Área C', incide: true, conceptual: false },

    // 5. Códigos de Libre Disposición JEC
    { codigo: '900', nombre: 'Taller de Libre Disposición', categoria: 'Talleres Libre Disposición JEC', incide: false, conceptual: false },
    { codigo: '901', nombre: 'Taller de Literatura / Lenguaje', categoria: 'Talleres Libre Disposición JEC', incide: false, conceptual: false },
    { codigo: '902', nombre: 'Taller de Matemática', categoria: 'Talleres Libre Disposición JEC', incide: false, conceptual: false },
    { codigo: '903', nombre: 'Taller de Ciencias', categoria: 'Talleres Libre Disposición JEC', incide: false, conceptual: false },
    { codigo: '904', nombre: 'Taller de Computación / Tecnología', categoria: 'Talleres Libre Disposición JEC', incide: false, conceptual: false },
    { codigo: '905', nombre: 'Taller de Deportes / Recreación', categoria: 'Talleres Libre Disposición JEC', incide: false, conceptual: false },
    { codigo: '906', nombre: 'Taller de Artes / Música', categoria: 'Talleres Libre Disposición JEC', incide: false, conceptual: false }
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

        // Sincronizar automáticamente con profesores jefe asignados previamente
        let updated = false;
        courses.forEach(c => {
          if (!c.profesorJefe || !c.profesorJefe.trim()) {
            const known = this.findKnownProfesorJefe(c.nombre);
            if (known) {
              c.profesorJefe = known;
              updated = true;
            }
          }
        });

        if (updated) {
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
      const clean = normalizeCourseString(nombre);
      return this.getCourses().find(c => normalizeCourseString(c.nombre) === clean) || null;
    }

    /**
     * Busca de forma inteligente y normalizada si existe un Profesor(a) Jefe
     * previamente asignado para un curso en la configuración global o cursos existentes.
     * Soporta coincidencias exactas, insensibles a mayúsculas/minúsculas, tildes,
     * y equivalencias como "Segundo medio" <-> "Segundo Medio A".
     */
    findKnownProfesorJefe(nombreCurso) {
      if (!nombreCurso || !nombreCurso.trim()) return '';
      const targetClean = normalizeCourseString(nombreCurso);

      const config = this.getConfig();
      const map = config.profesoresJefe || {};

      // 1. Coincidencia exacta en config.profesoresJefe
      if (map[nombreCurso] && map[nombreCurso].trim()) {
        return map[nombreCurso].trim();
      }

      // 2. Coincidencia normalizada exacta en config.profesoresJefe
      for (const key of Object.keys(map)) {
        if (map[key] && map[key].trim()) {
          if (normalizeCourseString(key) === targetClean) {
            return map[key].trim();
          }
        }
      }

      // 3. Coincidencia parcial / prefijo (ej: "Segundo medio" coincide con "Segundo Medio A")
      for (const key of Object.keys(map)) {
        if (map[key] && map[key].trim()) {
          const keyClean = normalizeCourseString(key);
          if (keyClean.startsWith(targetClean) || targetClean.startsWith(keyClean)) {
            return map[key].trim();
          }
        }
      }

      // 4. Buscar en los cursos guardados en DB
      try {
        const rawCourses = JSON.parse(localStorage.getItem(DB_KEYS.COURSES)) || [];
        for (const c of rawCourses) {
          if (c.profesorJefe && c.profesorJefe.trim()) {
            const cClean = normalizeCourseString(c.nombre);
            if (cClean === targetClean || cClean.startsWith(targetClean) || targetClean.startsWith(cClean)) {
              return c.profesorJefe.trim();
            }
          }
        }
      } catch (e) {}

      return '';
    }

    saveCourse(courseData) {
      const courses = this.getCourses();
      const nombre = (courseData.nombre || '').trim();
      let profesorJefe = (courseData.profesorJefe || '').trim();

      if (!nombre) return null;

      // Si no se proporcionó profesor jefe, buscar si ya había sido asignado previamente
      if (!profesorJefe) {
        profesorJefe = this.findKnownProfesorJefe(nombre);
      }

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
        const targetClean = normalizeCourseString(nombre);
        const existing = courses.find(c => normalizeCourseString(c.nombre) === targetClean);
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

      // Sincronizar también con config.profesoresJefe para persistencia institucional
      if (profesorJefe) {
        const config = this.getConfig();
        if (!config.profesoresJefe) config.profesoresJefe = {};
        config.profesoresJefe[nombre] = profesorJefe;
        this.saveConfig(config);
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
      const existingNames = new Set(currentCourses.map(c => normalizeCourseString(c.nombre)));

      NIVELES_DISPONIBLES.forEach((n, idx) => {
        const nClean = normalizeCourseString(n);
        if (!existingNames.has(nClean)) {
          const knownPj = this.findKnownProfesorJefe(n);
          currentCourses.push({
            id: 'cur_cat_' + (idx + 1),
            nombre: n,
            profesorJefe: knownPj || '',
            orden: currentCourses.length + 1
          });
          existingNames.add(nClean);
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
      const known = this.findKnownProfesorJefe(nivel);
      if (known) return known;
      const config = this.getConfig();
      return config.profesorJefe || 'Profesor(a) Jefe';
    }

    saveProfesorJefeForCourse(nivel, nombre) {
      const cleanPj = (nombre || '').trim();
      const course = this.getCourseByName(nivel);
      if (course) {
        course.profesorJefe = cleanPj;
        this.saveCourse(course);
      }
      const config = this.getConfig();
      if (!config.profesoresJefe) config.profesoresJefe = {};
      config.profesoresJefe[nivel] = cleanPj;
      this.saveConfig(config);
      window.dispatchEvent(new CustomEvent('courses_updated', { detail: { nivel, profesorJefe: cleanPj } }));
      return config;
    }

    saveAllProfesoresJefe(map) {
      const courses = this.getCourses();
      let modified = false;

      Object.keys(map).forEach(nivel => {
        const prof = (map[nivel] || '').trim();
        if (!prof) return;

        const targetClean = normalizeCourseString(nivel);
        courses.forEach(c => {
          const cClean = normalizeCourseString(c.nombre);
          if (cClean === targetClean || cClean.startsWith(targetClean) || targetClean.startsWith(cClean)) {
            c.profesorJefe = prof;
            modified = true;
          }
        });
      });

      if (modified) {
        localStorage.setItem(DB_KEYS.COURSES, JSON.stringify(courses));
      }

      const config = this.getConfig();
      config.profesoresJefe = { ...(config.profesoresJefe || {}), ...map };
      this.saveConfig(config);

      window.dispatchEvent(new CustomEvent('courses_updated', { detail: map }));
      return config;
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

      const codigo = (subjectData.codigo || '').trim();
      const incide = subjectData.incideEnPromedio !== undefined ? Boolean(subjectData.incideEnPromedio) : true;
      const conceptual = subjectData.esConceptual !== undefined 
        ? Boolean(subjectData.esConceptual) 
        : isTypicallyConceptual(subjectData.nombre);

      if (subjectData.id) {
        const idx = list.findIndex(s => s.id === subjectData.id);
        if (idx !== -1) {
          list[idx] = {
            ...list[idx],
            codigo,
            nombre: subjectData.nombre.trim(),
            incideEnPromedio: incide,
            esConceptual: conceptual
          };
          saved = list[idx];
        } else {
          saved = {
            id: subjectData.id,
            codigo,
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
          codigo,
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

    // --- CALIFICACIONES (1ER Y 2DO SEMESTRE + PROMEDIO ANUAL) ---
    getAllGrades() {
      try {
        return JSON.parse(localStorage.getItem(DB_KEYS.GRADES)) || [];
      } catch (e) {
        return [];
      }
    }

    getGradesByStudent(studentId, semestre = null) {
      const all = this.getAllGrades().filter(g => g.studentId === studentId);
      if (semestre === null) return all;
      const semNum = Number(semestre);
      return all.filter(g => Number(g.semestre || 1) === semNum);
    }

    getGradesForStudentAndSubject(studentId, subject, semestre = 1) {
      const all = this.getAllGrades();
      const semNum = Number(semestre) || 1;
      return all.find(g => g.studentId === studentId && g.subject === subject && Number(g.semestre || 1) === semNum) || null;
    }

    saveStudentGrades(studentId, subject, notesArray, semestre = 1) {
      const allGrades = this.getAllGrades();
      const semNum = Number(semestre) || 1;
      const idx = allGrades.findIndex(g => g.studentId === studentId && g.subject === subject && Number(g.semestre || 1) === semNum);

      // Calcular promedio del alumno en la asignatura para el semestre
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
        semestre: semNum,
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

    /**
     * Obtiene el desglose completo de notas del estudiante en una asignatura:
     * 1er Semestre, 2do Semestre y Promedio Final Anual según la regla oficial de redondeo MINEDUC.
     */
    getStudentSubjectFinalGrade(studentId, subject) {
      const g1 = this.getGradesForStudentAndSubject(studentId, subject, 1);
      const g2 = this.getGradesForStudentAndSubject(studentId, subject, 2);

      const p1 = g1 && g1.promedio !== null && !isNaN(g1.promedio) ? g1.promedio : null;
      const p2 = g2 && g2.promedio !== null && !isNaN(g2.promedio) ? g2.promedio : null;

      let promedioFinal = null;
      if (p1 !== null && p2 !== null) {
        promedioFinal = roundToChileanGrade((p1 + p2) / 2);
      } else if (p1 !== null) {
        promedioFinal = p1;
      } else if (p2 !== null) {
        promedioFinal = p2;
      }

      return {
        notes1: g1 ? g1.notes : [],
        promedio1S: p1,
        notes2: g2 ? g2.notes : [],
        promedio2S: p2,
        promedioFinal
      };
    }

    deleteGradesByStudent(studentId) {
      const filtered = this.getAllGrades().filter(g => g.studentId !== studentId);
      localStorage.setItem(DB_KEYS.GRADES, JSON.stringify(filtered));
    }

    /**
     * Calcula dinámicamente el Promedio General del Curso para una asignatura:
     * Soporta '1' (1er Semestre), '2' (2do Semestre) o 'anual' (Promedio Final de Curso).
     */
    getCourseSubjectAverage(nivel, subject, periodo = 'anual') {
      const students = this.getStudents(nivel);
      if (!students || students.length === 0) return null;

      const promediosConNota = [];

      students.forEach(std => {
        if (periodo === 1 || periodo === '1') {
          const g = this.getGradesForStudentAndSubject(std.id, subject, 1);
          if (g && g.promedio !== null && !isNaN(g.promedio)) promediosConNota.push(g.promedio);
        } else if (periodo === 2 || periodo === '2') {
          const g = this.getGradesForStudentAndSubject(std.id, subject, 2);
          if (g && g.promedio !== null && !isNaN(g.promedio)) promediosConNota.push(g.promedio);
        } else {
          const res = this.getStudentSubjectFinalGrade(std.id, subject);
          if (res.promedioFinal !== null && !isNaN(res.promedioFinal)) promediosConNota.push(res.promedioFinal);
        }
      });

      if (promediosConNota.length === 0) return null;

      const sum = promediosConNota.reduce((acc, val) => acc + val, 0);
      const rawCourseAvg = sum / promediosConNota.length;
      return roundToChileanGrade(rawCourseAvg);
    }

    /**
     * Calcula el Promedio General del Estudiante:
     * Soporta:
     * - periodo: 1 -> Promedio General 1° Semestre
     * - periodo: 2 -> Promedio General 2° Semestre
     * - periodo: 'anual' -> Promedio General Anual Acumulado
     * REGLA CLAVE: Solo considera asignaturas que INCIDEN en el promedio final (incideEnPromedio: true)
     * y que utilizan escala numérica (no conceptuales como Orientación o Religión).
     */
    getStudentGeneralAverage(studentId, periodo = 'anual') {
      const student = this.getStudentById(studentId);
      if (!student) return null;

      const courseSubjects = this.getSubjectsForCourse(student.nivel);
      // Mapa de asignaturas que inciden en el promedio
      const incidentSubjects = courseSubjects.filter(s => s.incideEnPromedio !== false && !s.esConceptual);

      const promedios = [];

      if (incidentSubjects.length > 0) {
        incidentSubjects.forEach(sub => {
          if (periodo === 1 || periodo === '1') {
            const g = this.getGradesForStudentAndSubject(studentId, sub.nombre, 1);
            if (g && g.promedio !== null && !isNaN(g.promedio)) promedios.push(g.promedio);
          } else if (periodo === 2 || periodo === '2') {
            const g = this.getGradesForStudentAndSubject(studentId, sub.nombre, 2);
            if (g && g.promedio !== null && !isNaN(g.promedio)) promedios.push(g.promedio);
          } else {
            const res = this.getStudentSubjectFinalGrade(studentId, sub.nombre);
            if (res.promedioFinal !== null && !isNaN(res.promedioFinal)) promedios.push(res.promedioFinal);
          }
        });
      } else {
        // Si aún no hay asignaturas configuradas, usar registros existentes excluyendo conceptuales
        const studentGrades = this.getGradesByStudent(studentId, (periodo === 1 || periodo === 2) ? periodo : null);
        studentGrades.forEach(g => {
          if (!isTypicallyConceptual(g.subject) && g.promedio !== null && !isNaN(g.promedio)) {
            promedios.push(g.promedio);
          }
        });
      }

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
    CATALOGO_SIGE,
    roundToChileanGrade,
    formatGrade,
    convertToConcept,
    getConceptDescription,
    getConceptBadgeClass,
    isTypicallyConceptual,
    normalizeCourseString,
    EducationalDB,
    db
  };
});
