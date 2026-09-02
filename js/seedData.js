/**
 * js/seedData.js
 * Generador de datos iniciales de demostración para el Liceo Andrés Alcázar de Tucapel.
 * Permite probar de inmediato la cuadrícula docente y la exportación de informes en PDF.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    const exports = factory(root);
    Object.assign(root, exports);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule) {

  const db = dbModule.db;
  const NIVELES_DISPONIBLES = dbModule.NIVELES_DISPONIBLES;
  const ASIGNATURAS_CATALOGO = dbModule.ASIGNATURAS_CATALOGO;
  const roundToChileanGrade = dbModule.roundToChileanGrade;

  function calculateDV(rutNum) {
    let M = 0, S = 1;
    let T = parseInt(rutNum, 10);
    for (; T; T = Math.floor(T / 10)) {
      S = (S + T % 10 * (9 - M++ % 6)) % 11;
    }
    return S ? (S - 1).toString() : 'K';
  }

  const SAMPLE_STUDENTS_P1 = [
    { rut: 24518293, nombres: 'Lucas Mateo', apellidoPaterno: 'Álvarez', apellidoMaterno: 'Muñoz' },
    { rut: 24781034, nombres: 'Sofía Valentina', apellidoPaterno: 'Barra', apellidoMaterno: 'Castillo' },
    { rut: 24391820, nombres: 'Matías Ignacio', apellidoPaterno: 'Carrasco', apellidoMaterno: 'Fuentes' },
    { rut: 24902188, nombres: 'Florencia Paz', apellidoPaterno: 'Díaz', apellidoMaterno: 'Morales' },
    { rut: 24119823, nombres: 'Benjamín Alonso', apellidoPaterno: 'Espinoza', apellidoMaterno: 'Soto' },
    { rut: 24876541, nombres: 'Martina Isidora', apellidoPaterno: 'Fernández', apellidoMaterno: 'Rojas' },
    { rut: 24329105, nombres: 'Joaquín Andrés', apellidoPaterno: 'González', apellidoMaterno: 'Pérez' },
    { rut: 24651092, nombres: 'Emilia Ignacia', apellidoPaterno: 'Herrera', apellidoMaterno: 'Contreras' },
    { rut: 24450912, nombres: 'Vicente Tomás', apellidoPaterno: 'Lara', apellidoMaterno: 'Silva' },
    { rut: 24981230, nombres: 'Catalina Javiera', apellidoPaterno: 'Molina', apellidoMaterno: 'Vega' },
    { rut: 24239841, nombres: 'Agustín Emilio', apellidoPaterno: 'Navarrete', apellidoMaterno: 'Reyes' },
    { rut: 24765901, nombres: 'Isidora Belén', apellidoPaterno: 'Orellana', apellidoMaterno: 'Garrido' },
    { rut: 24098412, nombres: 'Sebastián Esteban', apellidoPaterno: 'Pizarro', apellidoMaterno: 'Gómez' },
    { rut: 24670194, nombres: 'Renata Antonella', apellidoPaterno: 'Quezada', apellidoMaterno: 'Acuña' },
    { rut: 24589012, nombres: 'Gaspar Emiliano', apellidoPaterno: 'Riquelme', apellidoMaterno: 'Méndez' }
  ];

  const SAMPLE_STUDENTS_M1 = [
    { rut: 21980124, nombres: 'Alejandro David', apellidoPaterno: 'Aravena', apellidoMaterno: 'Poblete' },
    { rut: 21456789, nombres: 'Camila Francisca', apellidoPaterno: 'Bustos', apellidoMaterno: 'Cárdenas' },
    { rut: 21890234, nombres: 'Diego Maximiliano', apellidoPaterno: 'Castro', apellidoMaterno: 'Villalobos' },
    { rut: 21765432, nombres: 'Daniela Andrea', apellidoPaterno: 'Durán', apellidoMaterno: 'Paredes' },
    { rut: 21345980, nombres: 'Felipe Ignacio', apellidoPaterno: 'Flores', apellidoMaterno: 'Salazar' },
    { rut: 21678901, nombres: 'Javiera Nicole', apellidoPaterno: 'Guzmán', apellidoMaterno: 'Bravo' },
    { rut: 21234567, nombres: 'Ignacio Javier', apellidoPaterno: 'Henríquez', apellidoMaterno: 'Mancilla' },
    { rut: 21908765, nombres: 'Monserrat Paz', apellidoPaterno: 'Ibarra', apellidoMaterno: 'Navarro' },
    { rut: 21567890, nombres: 'Nicolás Eduardo', apellidoPaterno: 'Jara', apellidoMaterno: 'Miranda' },
    { rut: 21876543, nombres: 'Paulina Alejandra', apellidoPaterno: 'Leiva', apellidoMaterno: 'Valenzuela' },
    { rut: 21432109, nombres: 'Rodrigo Antonio', apellidoPaterno: 'Medina', apellidoMaterno: 'Toledo' },
    { rut: 21789012, nombres: 'Valeria Constanza', apellidoPaterno: 'Núñez', apellidoMaterno: 'Sandoval' }
  ];

  function initializeDemoData(force = false) {
    if (db.isInitialized() && !force) {
      return;
    }

    // Asegurar configuración institucional oficial
    db.saveConfig({
      nombre: 'Liceo Andrés Alcázar de Tucapel',
      rbd: '4580-1',
      logo: './assets/default_badge.svg',
      anioEscolar: '2026',
      comuna: 'Tucapel',
      region: 'Región del Biobío',
      director: 'Director(a) Establecimiento',
      profesorJefe: 'Profesor(a) Jefe'
    });

    // Crear cursos iniciales con sus Profesores Jefe asignados
    db.saveCourse({
      id: 'cur_p1a',
      nombre: 'Primero Básico A',
      profesorJefe: 'Prof. Carmen Gloria Muñoz'
    });
    db.saveCourse({
      id: 'cur_m1a',
      nombre: 'Primero Medio A',
      profesorJefe: 'Prof. Alejandro Valenzuela'
    });

    // Matricular estudiantes en Primero Básico A
    const p1Students = SAMPLE_STUDENTS_P1.map(st => {
      return db.saveStudent({
        rut: st.rut,
        dv: calculateDV(st.rut),
        nombres: st.nombres,
        apellidoPaterno: st.apellidoPaterno,
        apellidoMaterno: st.apellidoMaterno,
        nivel: 'Primero Básico A'
      });
    });

    // Matricular estudiantes en Primero Medio A
    const m1Students = SAMPLE_STUDENTS_M1.map(st => {
      return db.saveStudent({
        rut: st.rut,
        dv: calculateDV(st.rut),
        nombres: st.nombres,
        apellidoPaterno: st.apellidoPaterno,
        apellidoMaterno: st.apellidoMaterno,
        nivel: 'Primero Medio A'
      });
    });

    // Configurar asignaturas iniciales de demostración para Primero Básico A
    const p1CourseSubjects = [
      { codigo: '120', nombre: 'Lenguaje y Comunicación', incideEnPromedio: true, esConceptual: false },
      { codigo: '130', nombre: 'Matemática', incideEnPromedio: true, esConceptual: false },
      { codigo: '140', nombre: 'Ciencias Naturales', incideEnPromedio: true, esConceptual: false },
      { codigo: '150', nombre: 'Historia, Geografía y Ciencias Sociales', incideEnPromedio: true, esConceptual: false },
      { codigo: '110', nombre: 'Idioma Extranjero: Inglés', incideEnPromedio: true, esConceptual: false },
      { codigo: '180', nombre: 'Educación Física y Salud', incideEnPromedio: true, esConceptual: false },
      { codigo: '160', nombre: 'Artes Visuales', incideEnPromedio: true, esConceptual: false },
      { codigo: '170', nombre: 'Música', incideEnPromedio: true, esConceptual: false },
      { codigo: '190', nombre: 'Tecnología', incideEnPromedio: true, esConceptual: false },
      { codigo: '200', nombre: 'Orientación', incideEnPromedio: false, esConceptual: true }, // No incide (*), conceptual (I, S, B, MB)
      { codigo: '210', nombre: 'Religión', incideEnPromedio: false, esConceptual: true },      // No incide (*), conceptual (I, S, B, MB)
      { codigo: '900', nombre: 'Taller de Libre Disposición', esJec: true, nombreFantasia: 'Taller de Psicomotricidad y Juegos', incideEnPromedio: false, esConceptual: false }
    ];

    p1CourseSubjects.forEach(s => db.saveSubjectForCourse('Primero Básico A', s));

    // Generar calificaciones y asistencia para Primero Básico A
    populateAcademicData(p1Students, 'Primero Básico A', 90, p1CourseSubjects.map(s => s.nombre));

    // Configurar asignaturas iniciales para Primero Medio A
    const m1CourseSubjects = [
      { codigo: '120', nombre: 'Lengua y Literatura', incideEnPromedio: true, esConceptual: false },
      { codigo: '130', nombre: 'Matemática', incideEnPromedio: true, esConceptual: false },
      { codigo: '141', nombre: 'Biología', incideEnPromedio: true, esConceptual: false },
      { codigo: '142', nombre: 'Física', incideEnPromedio: true, esConceptual: false },
      { codigo: '143', nombre: 'Química', incideEnPromedio: true, esConceptual: false },
      { codigo: '150', nombre: 'Historia, Geografía y Ciencias Sociales', incideEnPromedio: true, esConceptual: false },
      { codigo: '110', nombre: 'Idioma Extranjero: Inglés', incideEnPromedio: true, esConceptual: false },
      { codigo: '180', nombre: 'Educación Física y Salud', incideEnPromedio: true, esConceptual: false },
      { codigo: '160', nombre: 'Artes Visuales', incideEnPromedio: true, esConceptual: false },
      { codigo: '170', nombre: 'Música', incideEnPromedio: true, esConceptual: false },
      { codigo: '190', nombre: 'Tecnología', incideEnPromedio: true, esConceptual: false },
      { codigo: '200', nombre: 'Orientación', incideEnPromedio: false, esConceptual: true },
      { codigo: '210', nombre: 'Religión', incideEnPromedio: false, esConceptual: true },
      { codigo: '900', nombre: 'Taller de Libre Disposición', esJec: true, nombreFantasia: 'Taller de Robótica y Ciencias', incideEnPromedio: false, esConceptual: false }
    ];

    m1CourseSubjects.forEach(s => db.saveSubjectForCourse('Primero Medio A', s));

    // Generar calificaciones y asistencia para Primero Medio A
    populateAcademicData(m1Students, 'Primero Medio A', 92, m1CourseSubjects.map(s => s.nombre));

    db.markInitialized();
  }

  function populateAcademicData(studentList, nivel, diasTrabajados, asignaturasPrueba) {
    studentList.forEach((std, idx) => {
      // 1. Asistencia del estudiante
      const diasAsistidos = Math.max(76, diasTrabajados - (idx % 6) * 2 - Math.floor(Math.random() * 3));
      db.saveStudentAttendance(std.id, nivel, diasTrabajados, diasAsistidos);

      // 2. Calificaciones en cada asignatura
      asignaturasPrueba.forEach((asig, aIdx) => {
        const isConceptSubject = asig.toLowerCase().includes('orientacion') || asig.toLowerCase().includes('religion');
        const numEvaluaciones = isConceptSubject ? 4 : 6 + (aIdx % 4);
        const notas = [];

        for (let c = 0; c < 12; c++) {
          if (c < numEvaluaciones) {
            if (idx === 0 && aIdx === 0 && c < 7) {
              const testNotes = [6.8, 6.5, 6.7, 6.2, 6.9, 6.3, 6.6];
              notas.push(testNotes[c]);
            } else if (idx === 1 && aIdx === 0 && c < 9) {
              const testNotes = [6.2, 6.5, 6.4, 6.3, 6.8, 6.1, 6.7, 6.5, 6.5];
              notas.push(testNotes[c]);
            } else if (isConceptSubject) {
              // Generar notas conceptuales variadas para mostrar MB, B, S, I
              // MB (6.0 - 7.0), B (5.0 - 5.9), S (4.0 - 4.9), I (1.0 - 3.9)
              const conceptGrades = [6.5, 6.8, 5.5, 4.5, 3.5, 6.0, 5.8];
              notas.push(conceptGrades[(idx + c) % conceptGrades.length]);
            } else {
              const base = 5.2 + ((idx + aIdx * 2 + c) % 18) * 0.1;
              const nota = Math.min(7.0, Math.max(3.8, Math.round(base * 10) / 10));
              notas.push(nota);
            }
          } else {
            notas.push(null);
          }
        }

        db.saveStudentGrades(std.id, asig, notas, 1);

        // Generar también calificaciones de demostración para el 2do Semestre
        const notasSem2 = notas.map(n => {
          if (n === null) return null;
          const delta = ((idx + aIdx) % 3 === 0) ? 0.2 : (((idx + aIdx) % 3 === 1) ? -0.2 : 0.1);
          return Math.min(7.0, Math.max(3.8, Math.round((n + delta) * 10) / 10));
        });
        db.saveStudentGrades(std.id, asig, notasSem2, 2);
      });
    });
  }

  return {
    calculateDV,
    initializeDemoData
  };
});
