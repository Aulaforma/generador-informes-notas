/**
 * js/reportGenerator.js
 * Módulo Generador de Informes Oficiales de Calificaciones y Asistencia.
 * Formato Oficial: Papel Carta Horizontal (Letter Landscape: 279.4mm x 215.9mm).
 * Estructura:
 * - Membrete Institucional (Liceo Andrés Alcázar de Tucapel, RBD 4580-1, Insignia).
 * - Antecedentes del Estudiante y Profesor(a) Jefe Titular.
 * - Tabla Comparativa Semestral (1° Semestre N1..N6 + Prom 1S | 2° Semestre N1..N6 + Prom 2S | Promedio Final | Promedio Curso).
 * - Resumen Académico con Promedio General Anual, Asistencia Anual (%) y Leyendas Oficiales.
 * - Firmas Institucionales de Profesor(a) Jefe y Dirección.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.ReportGenerator = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule) {

  const db = dbModule.db;
  const formatGrade = dbModule.formatGrade;
  const convertToConcept = dbModule.convertToConcept;

  class ReportGenerator {
    constructor() {
      this.container = document.getElementById('report-preview-container');
      this.modeRadioBatch = document.getElementById('report-mode-batch');
      this.modeRadioSingle = document.getElementById('report-mode-single');
      this.nivelSelect = document.getElementById('report-select-nivel');
      this.studentSelect = document.getElementById('report-select-student');
      this.studentSelectGroup = document.getElementById('report-student-select-group');
      this.countBadge = document.getElementById('report-count-badge');

      this.init();
    }

    init() {
      this.populateNivelSelect();
      this.initEvents();

      // Escuchar eventos globales de actualización
      window.addEventListener('school_config_updated', () => {
        this.renderPreview();
      });

      window.addEventListener('students_updated', () => {
        this.updateStudentDropdown();
        this.renderPreview();
      });

      window.addEventListener('subjects_updated', () => {
        this.renderPreview();
      });

      window.addEventListener('courses_updated', () => {
        this.populateNivelSelect();
        this.updateStudentDropdown();
        this.renderPreview();
      });
    }

    populateNivelSelect() {
      if (!this.nivelSelect) return;
      const courses = db.getCourseNames();
      if (courses.length === 0) {
        this.nivelSelect.innerHTML = '<option value="">(No hay cursos creados)</option>';
        return;
      }

      const previousValue = this.nivelSelect.value;
      this.nivelSelect.innerHTML = courses.map(c => 
        `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
      ).join('');

      if (previousValue && courses.includes(previousValue)) {
        this.nivelSelect.value = previousValue;
      } else {
        const p1Option = courses.find(c => c === 'Primero Básico A');
        this.nivelSelect.value = p1Option || courses[0];
      }
    }

    initEvents() {
      if (this.modeRadioBatch && this.modeRadioSingle) {
        this.modeRadioBatch.addEventListener('change', () => {
          this.handleModeChange();
        });
        this.modeRadioSingle.addEventListener('change', () => {
          this.handleModeChange();
        });
      }

      if (this.nivelSelect) {
        this.nivelSelect.addEventListener('change', () => {
          this.updateStudentDropdown();
          this.renderPreview();
        });
      }

      if (this.studentSelect) {
        this.studentSelect.addEventListener('change', () => {
          this.renderPreview();
        });
      }
    }

    handleModeChange() {
      const isSingle = this.modeRadioSingle && this.modeRadioSingle.checked;
      if (this.studentSelectGroup) {
        this.studentSelectGroup.style.display = isSingle ? 'block' : 'none';
      }
      if (isSingle) {
        this.updateStudentDropdown();
      }
      this.renderPreview();
    }

    updateStudentDropdown() {
      if (!this.studentSelect || !this.nivelSelect) return;
      const nivel = this.nivelSelect.value;
      const students = db.getStudents(nivel);

      if (students.length === 0) {
        this.studentSelect.innerHTML = '<option value="">(No hay alumnos matriculados)</option>';
        this.studentSelect.disabled = true;
        return;
      }

      this.studentSelect.disabled = false;
      this.studentSelect.innerHTML = students.map(s => `
        <option value="${s.id}">
          ${escapeHtml(s.apellidoPaterno)} ${escapeHtml(s.apellidoMaterno)}, ${escapeHtml(s.nombres)} (${formatRut(s.rut, s.dv)})
        </option>
      `).join('');
    }

    generateStudentReportHtml(student, config) {
      const nivel = student.nivel;
      const formattedRut = formatRut(student.rut, student.dv);
      const currentDateStr = new Date().toLocaleDateString('es-CL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // 1. Obtener las asignaturas configuradas para este curso
      const courseSubjects = db.getSubjectsForCourse(nivel);

      if (courseSubjects.length === 0) {
        return `
          <div class="report-page letter-sheet" style="display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; color: #475569;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📚</div>
            <h2 style="color: #1e3a8a;">Asignaturas No Configuradas</h2>
            <p>El curso <strong>${escapeHtml(nivel)}</strong> aún no tiene asignaturas registradas en el plan de estudios.</p>
            <p style="font-size: 0.85rem; color: #64748b; margin-top: 0.5rem;">Vaya a la pestaña "🏫 Cursos y Asignaturas" para agregar las materias correspondientes.</p>
          </div>
        `;
      }

      let hasNonIncidentSubjects = false;
      let hasConceptualSubjects = false;
      let evaluatedIncidentCount = 0;

      // Generar filas de tabla comparativa de calificaciones (1er Semestre, 2do Semestre, Promedio Final)
      const rowsHtml = courseSubjects.slice(0, 16).map((sub, index) => {
        const finalData = db.getStudentSubjectFinalGrade(student.id, sub.nombre);
        const notes1 = finalData.notes1 || [];
        const notes2 = finalData.notes2 || [];
        const p1 = finalData.promedio1S;
        const p2 = finalData.promedio2S;
        const pFinal = finalData.promedioFinal;
        const courseFinalAvg = db.getCourseSubjectAverage(nivel, sub.nombre, 'anual');

        const noIncide = sub.incideEnPromedio === false;
        const isConceptual = sub.esConceptual;

        if (noIncide) hasNonIncidentSubjects = true;
        if (isConceptual) hasConceptualSubjects = true;

        if (pFinal !== null && !noIncide && !isConceptual) {
          evaluatedIncidentCount++;
        }

        const subjectDisplayName = noIncide ? `${sub.nombre} *` : sub.nombre;

        // Notas parciales 1° Semestre (hasta 6 evaluaciones visibles)
        const n1Cells = Array.from({ length: 6 }).map((_, i) => {
          const val = notes1[i];
          if (val === null || val === undefined || val === '') return `<td class="center" style="width: 20px; font-size: 7pt; color: #cbd5e1;">-</td>`;
          if (isConceptual) {
            const c = convertToConcept(val);
            return `<td class="center" style="width: 20px; font-size: 7.2pt; font-weight: 700;">${c}</td>`;
          }
          const num = Number(val);
          const colorCls = num < 4.0 ? 'style="color: #b91c1c; font-weight: 700; width: 20px; font-size: 7.2pt;"' : 'style="width: 20px; font-size: 7.2pt;"';
          return `<td class="center" ${colorCls}>${formatGrade(num)}</td>`;
        }).join('');

        // Promedio 1° Semestre
        let p1Display = '-';
        let p1Class = '';
        if (p1 !== null) {
          if (isConceptual) {
            p1Display = convertToConcept(p1);
            p1Class = p1Display === 'I' ? 'grade-low' : (p1Display === 'MB' ? 'grade-good' : '');
          } else {
            p1Display = formatGrade(p1);
            p1Class = p1 < 4.0 ? 'grade-low' : (p1 >= 6.0 ? 'grade-good' : '');
          }
        }

        // Notas parciales 2° Semestre (hasta 6 evaluaciones visibles)
        const n2Cells = Array.from({ length: 6 }).map((_, i) => {
          const val = notes2[i];
          if (val === null || val === undefined || val === '') return `<td class="center" style="width: 20px; font-size: 7pt; color: #cbd5e1;">-</td>`;
          if (isConceptual) {
            const c = convertToConcept(val);
            return `<td class="center" style="width: 20px; font-size: 7.2pt; font-weight: 700;">${c}</td>`;
          }
          const num = Number(val);
          const colorCls = num < 4.0 ? 'style="color: #b91c1c; font-weight: 700; width: 20px; font-size: 7.2pt;"' : 'style="width: 20px; font-size: 7.2pt;"';
          return `<td class="center" ${colorCls}>${formatGrade(num)}</td>`;
        }).join('');

        // Promedio 2° Semestre
        let p2Display = '-';
        let p2Class = '';
        if (p2 !== null) {
          if (isConceptual) {
            p2Display = convertToConcept(p2);
            p2Class = p2Display === 'I' ? 'grade-low' : (p2Display === 'MB' ? 'grade-good' : '');
          } else {
            p2Display = formatGrade(p2);
            p2Class = p2 < 4.0 ? 'grade-low' : (p2 >= 6.0 ? 'grade-good' : '');
          }
        }

        // Promedio Final Anual de la Asignatura
        let pFinalDisplay = '-';
        let pFinalClass = '';
        if (pFinal !== null) {
          if (isConceptual) {
            pFinalDisplay = convertToConcept(pFinal);
            pFinalClass = pFinalDisplay === 'I' ? 'grade-low' : (pFinalDisplay === 'MB' ? 'grade-good' : '');
          } else {
            pFinalDisplay = formatGrade(pFinal);
            pFinalClass = pFinal < 4.0 ? 'grade-low' : (pFinal >= 6.0 ? 'grade-good' : '');
          }
        }

        // Promedio Curso Anual
        let courseAvgDisplay = '-';
        if (courseFinalAvg !== null) {
          if (isConceptual) {
            courseAvgDisplay = convertToConcept(courseFinalAvg);
          } else {
            courseAvgDisplay = formatGrade(courseFinalAvg);
          }
        }

        return `
          <tr>
            <td class="center" style="width: 22px; color: #64748b; font-size: 7.2pt;">${index + 1}</td>
            <td class="center" style="width: 38px; font-family: monospace; font-size: 7.2pt; font-weight: 700; color: #475569;">
              ${sub.codigo ? escapeHtml(sub.codigo) : '-'}
            </td>
            <td style="font-weight: 600; font-size: 8pt; padding-left: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 210px;">
              ${escapeHtml(subjectDisplayName)}
            </td>
            ${n1Cells}
            <td class="center grade-val ${p1Class}" style="width: 38px; font-weight: 800; background: #eff6ff; font-size: 8.5pt;">${p1Display}</td>
            ${n2Cells}
            <td class="center grade-val ${p2Class}" style="width: 38px; font-weight: 800; background: #fff7ed; font-size: 8.5pt;">${p2Display}</td>
            <td class="center grade-val ${pFinalClass}" style="width: 50px; font-weight: 800; background: #f8fafc; font-size: 9pt; border-left: 2px solid #cbd5e1;">${pFinalDisplay}</td>
            <td class="center" style="width: 48px; font-weight: 600; color: #334155; font-size: 7.8pt;">${courseAvgDisplay}</td>
          </tr>
        `;
      }).join('');

      // 2. Promedios Generales del Estudiante
      const genAvg1S = db.getStudentGeneralAverage(student.id, 1);
      const genAvg2S = db.getStudentGeneralAverage(student.id, 2);
      const genAvgAnual = db.getStudentGeneralAverage(student.id, 'anual');

      // 3. Asistencia Escolar
      const attendance = db.getAttendanceByStudent(student.id) || {
        diasTrabajados: 90,
        diasAsistidos: 90,
        porcentaje: 100
      };

      const isRiskAtt = attendance.porcentaje < 85;
      const profesorJefeTitular = db.getProfesorJefeForCourse(student.nivel);

      return `
        <div class="report-page letter-sheet">
          <!-- 1. Cabecera Institucional (Membrete Oficial) -->
          <div class="report-header sheet-header" style="margin-bottom: 4px; padding-bottom: 4px;">
            <img src="${config.logo || './assets/default_badge.svg'}" alt="Insignia" class="report-header-logo sheet-logo" style="width: 52px; height: 58px;" />
            <div class="report-header-title sheet-title-box">
              <h1 style="font-size: 11.5pt; font-weight: 800; color: #1e3a8a; margin: 0; text-transform: uppercase;">
                ${escapeHtml(config.nombre || 'Liceo Andrés Alcázar de Tucapel')}
              </h1>
              <h2 style="font-size: 9.5pt; font-weight: 700; color: #0f172a; margin: 1px 0; text-transform: uppercase;">
                INFORME DE CALIFICACIONES Y RENDIMIENTO ESCOLAR ANUAL
              </h2>
              <p style="font-size: 7.5pt; color: #475569; margin: 0;">
                ${escapeHtml(config.comuna || 'Tucapel')} • ${escapeHtml(config.region || 'Región del Biobío')} • Año Escolar ${config.anioEscolar || '2026'}
              </p>
            </div>
            <div class="report-header-rbd sheet-rbd-box" style="text-align: right; font-size: 7.5pt; min-width: 85px;">
              <strong style="color: #1e3a8a; font-size: 8.5pt;">RBD: ${escapeHtml(config.rbd || '4580-1')}</strong><br />
              <span style="color: #64748b;">MINEDUC</span>
            </div>
          </div>

          <!-- 2. Ficha de Antecedentes del Estudiante (Distribución Horizontal) -->
          <div class="student-data-box sheet-student-info" style="display: grid; grid-template-columns: 2.5fr 1.1fr 1.1fr 1.6fr 1fr; gap: 4px 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; margin-bottom: 5px; font-size: 7.8pt;">
            <div>
              <span class="item-label" style="font-weight: 700; color: #334155;">ESTUDIANTE:</span> 
              <span class="item-value" style="font-weight: 700; color: #0f172a; text-transform: uppercase;">
                ${escapeHtml(student.apellidoPaterno)} ${escapeHtml(student.apellidoMaterno)}, ${escapeHtml(student.nombres)}
              </span>
            </div>
            <div>
              <span class="item-label" style="font-weight: 700; color: #334155;">RUN:</span> 
              <span class="item-value" style="font-weight: 700; font-family: monospace;">${formattedRut}</span>
            </div>
            <div>
              <span class="item-label" style="font-weight: 700; color: #334155;">CURSO:</span> 
              <span class="item-value" style="font-weight: 700;">${escapeHtml(student.nivel)}</span>
            </div>
            <div>
              <span class="item-label" style="font-weight: 700; color: #334155;">PROFESOR(A) JEFE:</span> 
              <span class="item-value" style="font-weight: 600;">${escapeHtml(profesorJefeTitular)}</span>
            </div>
            <div style="text-align: right;">
              <span class="item-label" style="font-weight: 700; color: #334155;">AÑO:</span> 
              <span class="item-value" style="font-weight: 700;">${config.anioEscolar || '2026'}</span>
            </div>
          </div>

          <!-- 3. Tabla Comparativa de Calificaciones Horizontal (1° Semestre | 2° Semestre | Final) -->
          <table class="report-grades-table sheet-table" style="width: 100%; border-collapse: collapse; margin-bottom: 4px; font-size: 7.5pt;">
            <thead>
              <tr style="background: #1e3a8a; color: white;">
                <th rowspan="2" class="center" style="width: 22px; vertical-align: middle; border: 1px solid #1e3a8a; font-size: 7pt;">#</th>
                <th rowspan="2" class="center" style="width: 38px; vertical-align: middle; border: 1px solid #1e3a8a; font-size: 7pt;">CÓD.</th>
                <th rowspan="2" style="vertical-align: middle; border: 1px solid #1e3a8a; font-size: 7.5pt; text-align: left; padding-left: 6px;">ASIGNATURA / SUBSECTOR</th>
                <th colspan="7" class="center" style="border: 1px solid #1e3a8a; background: #1e40af; font-size: 7.5pt; padding: 2px;">1° SEMESTRE</th>
                <th colspan="7" class="center" style="border: 1px solid #1e3a8a; background: #c2410c; font-size: 7.5pt; padding: 2px;">2° SEMESTRE</th>
                <th rowspan="2" class="center" style="width: 50px; vertical-align: middle; border: 1px solid #1e3a8a; background: #0f172a; font-size: 7.5pt;">PROM. FINAL</th>
                <th rowspan="2" class="center" style="width: 48px; vertical-align: middle; border: 1px solid #1e3a8a; background: #334155; font-size: 7pt;">PROM. CURSO</th>
              </tr>
              <tr style="background: #2563eb; color: white; font-size: 6.8pt;">
                <!-- Subcolumnas 1° Semestre -->
                <th class="center" style="width: 20px; border: 1px solid #1e3a8a;">N1</th>
                <th class="center" style="width: 20px; border: 1px solid #1e3a8a;">N2</th>
                <th class="center" style="width: 20px; border: 1px solid #1e3a8a;">N3</th>
                <th class="center" style="width: 20px; border: 1px solid #1e3a8a;">N4</th>
                <th class="center" style="width: 20px; border: 1px solid #1e3a8a;">N5</th>
                <th class="center" style="width: 20px; border: 1px solid #1e3a8a;">N6</th>
                <th class="center" style="width: 38px; border: 1px solid #1e3a8a; background: #1e3a8a; font-weight: 800;">PROM 1S</th>

                <!-- Subcolumnas 2° Semestre -->
                <th class="center" style="width: 20px; border: 1px solid #c2410c; background: #ea580c;">N1</th>
                <th class="center" style="width: 20px; border: 1px solid #c2410c; background: #ea580c;">N2</th>
                <th class="center" style="width: 20px; border: 1px solid #c2410c; background: #ea580c;">N3</th>
                <th class="center" style="width: 20px; border: 1px solid #c2410c; background: #ea580c;">N4</th>
                <th class="center" style="width: 20px; border: 1px solid #c2410c; background: #ea580c;">N5</th>
                <th class="center" style="width: 20px; border: 1px solid #c2410c; background: #ea580c;">N6</th>
                <th class="center" style="width: 38px; border: 1px solid #c2410c; background: #9a3412; font-weight: 800;">PROM 2S</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <!-- 4. Resumen Académico, Asistencia y Firmas (3 Columnas Horizontales) -->
          <div style="display: grid; grid-template-columns: 1.2fr 1.6fr 1.2fr; gap: 8px; align-items: stretch; margin-top: 4px;">
            <!-- Cuadro 1: Resumen de Promedios Generales -->
            <div style="border: 1.5px solid #1e3a8a; border-radius: 4px; padding: 5px 8px; background: #ffffff;">
              <div style="font-size: 7.2pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; margin-bottom: 3px;">
                📊 Rendimiento General
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 7.2pt; margin-bottom: 2px;">
                <span style="color: #475569;">Promedio 1° Semestre:</span>
                <strong style="color: #1e40af;">${genAvg1S !== null ? formatGrade(genAvg1S) : '-'}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 7.2pt; margin-bottom: 3px;">
                <span style="color: #475569;">Promedio 2° Semestre:</span>
                <strong style="color: #ea580c;">${genAvg2S !== null ? formatGrade(genAvg2S) : '-'}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; background: #eff6ff; padding: 2px 4px; border-radius: 3px; border-top: 1px solid #bfdbfe;">
                <strong style="color: #1e3a8a; font-size: 7.5pt;">PROMEDIO FINAL:</strong>
                <strong style="font-size: 10.5pt; color: ${genAvgAnual !== null && genAvgAnual < 4.0 ? '#dc2626' : '#1e3a8a'};">
                  ${genAvgAnual !== null ? formatGrade(genAvgAnual) : '-'}
                </strong>
              </div>
            </div>

            <!-- Cuadro 2: Asistencia y Leyenda Reglamentaria -->
            <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 8px; background: #f8fafc; font-size: 7pt; display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="font-weight: 800; color: #334155; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin-bottom: 3px;">
                  📅 Asistencia Escolar & Normativa
                </div>
                <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 3px;">
                  <span>Días Trab: <strong>${attendance.diasTrabajados}</strong></span>
                  <span>Días Asist: <strong>${attendance.diasAsistidos}</strong></span>
                  <span style="background: ${isRiskAtt ? '#fee2e2' : '#dcfce7'}; color: ${isRiskAtt ? '#991b1b' : '#166534'}; padding: 1px 5px; border-radius: 3px; font-weight: 800;">
                    ${attendance.porcentaje.toFixed(1).replace('.', ',')}% Asistencia
                  </span>
                </div>
              </div>
              <div style="font-size: 6.5pt; color: #64748b; line-height: 1.25;">
                ${hasNonIncidentSubjects ? '<span><strong>*</strong> Asignatura no incide en el promedio final. </span>' : ''}
                ${hasConceptualSubjects ? '<span><strong>Escala:</strong> MB (6,0-7,0) • B (5,0-5,9) • S (4,0-4,9) • I (1,0-3,9).</span>' : ''}
              </div>
            </div>

            <!-- Cuadro 3: Firmas Institucionales -->
            <div style="display: flex; gap: 8px; justify-content: space-around; align-items: flex-end; padding-bottom: 2px;">
              <div style="text-align: center; flex: 1;">
                <div style="border-top: 1px solid #334155; margin-bottom: 2px; width: 90%; margin-left: auto; margin-right: auto;"></div>
                <div style="font-size: 6.8pt; font-weight: 700; color: #1e293b;">Profesor(a) Jefe</div>
                <div style="font-size: 6.2pt; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(profesorJefeTitular)}</div>
              </div>
              <div style="text-align: center; flex: 1;">
                <div style="border-top: 1px solid #334155; margin-bottom: 2px; width: 90%; margin-left: auto; margin-right: auto;"></div>
                <div style="font-size: 6.8pt; font-weight: 700; color: #1e293b;">Dirección</div>
                <div style="font-size: 6.2pt; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(config.director || 'Director(a)')}</div>
              </div>
            </div>
          </div>

          <!-- Pie de página oficial -->
          <div style="text-align: center; font-size: 6.2pt; color: #94a3b8; margin-top: 3px;">
            Documento Oficial del ${escapeHtml(config.nombre || 'Liceo Andrés Alcázar de Tucapel')} • Formato Oficial Carta Horizontal (Landscape) • Emisión: ${currentDateStr}
          </div>
        </div>
      `;
    }

    renderPreview() {
      if (!this.container || !this.nivelSelect) return;

      const nivel = this.nivelSelect.value;
      if (!nivel) {
        this.container.innerHTML = `
          <div class="report-page letter-sheet" style="display: flex; justify-content: center; align-items: center; text-align: center; color: #64748b;">
            <p>Seleccione un curso para generar los informes oficiales.</p>
          </div>
        `;
        if (this.countBadge) this.countBadge.textContent = '0 informes';
        return;
      }

      const config = db.getConfig();
      const isSingle = this.modeRadioSingle && this.modeRadioSingle.checked;

      let studentsToRender = [];
      if (isSingle) {
        const studentId = this.studentSelect ? this.studentSelect.value : null;
        const student = studentId ? db.getStudentById(studentId) : null;
        if (student) studentsToRender.push(student);
      } else {
        studentsToRender = db.getStudents(nivel);
      }

      if (this.countBadge) {
        this.countBadge.textContent = `${studentsToRender.length} informe(s) tamaño Carta Horizontal`;
      }

      if (studentsToRender.length === 0) {
        this.container.innerHTML = `
          <div class="report-page letter-sheet" style="display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; color: #64748b;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">👨‍🎓</div>
            <strong style="color: #1e3a8a; font-size: 1.1rem;">No hay estudiantes matriculados en ${escapeHtml(nivel)}</strong>
            <p style="font-size: 0.85rem; margin-top: 0.5rem;">Vaya a la pestaña "Matrícula" para inscribir estudiantes o hacer carga masiva.</p>
          </div>
        `;
        return;
      }

      const html = studentsToRender.map(student => this.generateStudentReportHtml(student, config)).join('');
      this.container.innerHTML = html;
    }
  }

  function formatRut(rut, dv) {
    if (!rut) return '-';
    const cleanRut = String(rut).replace(/[^0-9]/g, '');
    const formatted = cleanRut.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${formatted}-${dv}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return ReportGenerator;
});
