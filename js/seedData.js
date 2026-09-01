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

    // Generar calificaciones y asistencia para Primero Básico A
    populateAcademicData(p1Students, 'Primero Básico A', 90);

    // Generar calificaciones y asistencia para Primero Medio A
    populateAcademicData(m1Students, 'Primero Medio A', 92);

    db.markInitialized();
  }

  function populateAcademicData(studentList, nivel, diasTrabajados) {
    // Asignaturas principales para la prueba
    const asignaturasPrueba = ASIGNATURAS_CATALOGO.slice(0, 14);

    studentList.forEach((std, idx) => {
      // 1. Asistencia del estudiante
      const diasAsistidos = Math.max(76, diasTrabajados - (idx % 6) * 2 - Math.floor(Math.random() * 3));
      db.saveStudentAttendance(std.id, nivel, diasTrabajados, diasAsistidos);

      // 2. Calificaciones en cada asignatura
      asignaturasPrueba.forEach((asig, aIdx) => {
        // Generar notas simuladas para 6 a 8 evaluaciones de las 12 disponibles
        const numEvaluaciones = 6 + (aIdx % 4);
        const notas = [];

        for (let c = 0; c < 12; c++) {
          if (c < numEvaluaciones) {
            // Para probar exactamente los ejemplos del usuario:
            // Caso idx=0, asig 0 -> notas que den exactamente 6.57 para verificar 6.6
            // Caso idx=1, asig 0 -> notas que den 6.44 para verificar 6.4
            if (idx === 0 && aIdx === 0 && c < 7) {
              // [6.8, 6.5, 6.7, 6.2, 6.9, 6.3, 6.6] = 46.0 / 7 = 6.5714 -> 6.6
              const testNotes = [6.8, 6.5, 6.7, 6.2, 6.9, 6.3, 6.6];
              notas.push(testNotes[c]);
            } else if (idx === 1 && aIdx === 0 && c < 9) {
              // [6.2, 6.5, 6.4, 6.3, 6.8, 6.1, 6.7, 6.5, 6.5] = 58.0 / 9 = 6.444 -> 6.4
              const testNotes = [6.2, 6.5, 6.4, 6.3, 6.8, 6.1, 6.7, 6.5, 6.5];
              notas.push(testNotes[c]);
            } else {
              // Distribución natural
              const base = 5.2 + ((idx + aIdx * 2 + c) % 18) * 0.1;
              const nota = Math.min(7.0, Math.max(3.8, Math.round(base * 10) / 10));
              notas.push(nota);
            }
          } else {
            notas.push(null);
          }
        }

        db.saveStudentGrades(std.id, asig, notas);
      });
    });
  }

  return {
    calculateDV,
    initializeDemoData
  };
});
