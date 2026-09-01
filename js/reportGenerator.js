/**
 * js/reportGenerator.js
 * Motor de plantillas oficial para la generación de Informes de Calificaciones y Asistencia.
 * Genera el documento individual o por lote (curso completo) en tamaño Carta (Letter),
 * garantizando que cada estudiante ocupe exactamente 1 página física.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.ReportGenerator = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule) {

  const db = dbModule.db;
  const ASIGNATURAS_CATALOGO = dbModule.ASIGNATURAS_CATALOGO;
  const formatGrade = dbModule.formatGrade;
  const roundToChileanGrade = dbModule.roundToChileanGrade;

  class ReportGenerator {
    constructor() {
      this.container = document.getElementById('report-preview-container');
      this.nivelSelect = document.getElementById('report-select-nivel');
      this.studentSelect = document.getElementById('report-select-student');
      this.modeRadioSingle = document.getElementById('report-mode-single');
      this.modeRadioBatch = document.getElementById('report-mode-batch');
      this.reportCountBadge = document.getElementById('report-count-badge');

      this.init();
    }

    init() {
      this.initEvents();
    }

    initEvents() {
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

      if (this.modeRadioSingle) {
        this.modeRadioSingle.addEventListener('change', () => {
          this.toggleMode();
          this.renderPreview();
        });
      }

      if (this.modeRadioBatch) {
        this.modeRadioBatch.addEventListener('change', () => {
          this.toggleMode();
          this.renderPreview();
        });
      }
    }

    toggleMode() {
      const isBatch = this.modeRadioBatch && this.modeRadioBatch.checked;
      const studentSelectGroup = document.getElementById('report-student-select-group');
      if (studentSelectGroup) {
        studentSelectGroup.style.display = isBatch ? 'none' : 'block';
      }
    }

    updateStudentDropdown() {
      if (!this.studentSelect || !this.nivelSelect) return;
      const nivel = this.nivelSelect.value;
      const students = db.getStudents(nivel);

      if (students.length === 0) {
        this.studentSelect.innerHTML = '<option value="">No hay alumnos en este nivel</option>';
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

    generateStudentReportHtml(student, config, allCourseSubjects) {
      const nivel = student.nivel;
      const formattedRut = formatRut(student.rut, student.dv);
      const currentDateStr = new Date().toLocaleDateString('es-CL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // 1. Obtener notas de cada asignatura y promedios comparativos
      let evaluatedCount = 0;
      let studentSum = 0;

      const rowsHtml = allCourseSubjects.map((asig, index) => {
        const gradeRecord = db.getGradesForStudentAndSubject(student.id, asig);
        const studentSubjectAvg = (gradeRecord && gradeRecord.promedio !== null && gradeRecord.promedio !== undefined) ? gradeRecord.promedio : null;
        const courseSubjectAvg = db.getCourseSubjectAverage(nivel, asig);

        if (studentSubjectAvg !== null) {
          evaluatedCount++;
          studentSum += studentSubjectAvg;
        }

        const formattedStudentGrade = formatGrade(studentSubjectAvg);
        const formattedCourseGrade = formatGrade(courseSubjectAvg);

        const isLowGrade = studentSubjectAvg !== null && studentSubjectAvg < 4.0;
        const gradeClass = isLowGrade ? 'grade-low' : (studentSubjectAvg >= 6.0 ? 'grade-good' : '');

        return `
          <tr>
            <td class="center" style="width: 26px; color: #64748b; font-size: 7.5pt;">${index + 1}</td>
            <td style="font-weight: 500;">${escapeHtml(asig)}</td>
            <td class="center grade-val ${gradeClass}" style="width: 85px;">${formattedStudentGrade}</td>
            <td class="center" style="width: 105px; color: #334155; font-weight: 600;">${formattedCourseGrade}</td>
          </tr>
        `;
      }).join('');

      // 2. Promedio General del Estudiante (Regla oficial de redondeo chilena a partir del 2do decimal)
      let generalAverage = null;
      if (evaluatedCount > 0) {
        generalAverage = roundToChileanGrade(studentSum / evaluatedCount);
      }
      const formattedGeneralAvg = formatGrade(generalAverage);

      // 3. Asistencia del Estudiante
      const attendance = db.getAttendanceByStudent(student.id) || {
        diasTrabajados: 90,
        diasAsistidos: 90,
        porcentaje: 100
      };

      const isRiskAtt = attendance.porcentaje < 85;

      return `
        <div class="report-page letter-sheet">
          <!-- 1. Cabecera Institucional (Membrete) -->
          <div class="report-header sheet-header">
            <img src="${config.logo || './assets/default_badge.svg'}" alt="Insignia" class="report-header-logo sheet-logo" />
            <div class="report-header-title sheet-title-box">
              <h1>${escapeHtml(config.nombre || 'Liceo Andrés Alcázar de Tucapel')}</h1>
              <h2>INFORME DE CALIFICACIONES Y ASISTENCIA</h2>
              <p>${escapeHtml(config.comuna || 'Tucapel')} • ${escapeHtml(config.region || 'Región del Biobío')} • Año Escolar ${config.anioEscolar || '2026'}</p>
            </div>
            <div class="report-header-rbd sheet-rbd-box">
              <strong>RBD: ${escapeHtml(config.rbd || '4580-1')}</strong><br />
              <span style="font-size: 7.5pt; color: #64748b;">MINEDUC</span>
            </div>
          </div>

          <!-- 2. Ficha de Antecedentes del Estudiante -->
          <div class="student-data-box sheet-student-info">
            <div>
              <span class="item-label">ESTUDIANTE:</span> 
              <span class="item-value" style="text-transform: uppercase;">
                ${escapeHtml(student.apellidoPaterno)} ${escapeHtml(student.apellidoMaterno)}, ${escapeHtml(student.nombres)}
              </span>
            </div>
            <div>
              <span class="item-label">R.U.T.:</span> 
              <span class="item-value" style="font-family: monospace;">${formattedRut}</span>
            </div>
            <div>
              <span class="item-label">CURSO:</span> 
              <span class="item-value">${escapeHtml(student.nivel)}</span>
            </div>
            <div>
              <span class="item-label">PROFESOR(A) JEFE:</span> 
              <span class="item-value">${escapeHtml(config.profesorJefe || 'Profesor(a) Jefe')}</span>
            </div>
            <div>
              <span class="item-label">FECHA EMISIÓN:</span> 
              <span class="item-value">${currentDateStr}</span>
            </div>
            <div>
              <span class="item-label">AÑO LECTIVO:</span> 
              <span class="item-value">${config.anioEscolar || '2026'}</span>
            </div>
          </div>

          <!-- 3. Cuerpo del Informe: Tabla Comparativa (hasta 18 filas) -->
          <table class="report-grades-table sheet-table">
            <thead>
              <tr>
                <th class="center" style="width: 26px;">#</th>
                <th>Sector de Aprendizaje / Asignatura</th>
                <th class="center" style="width: 85px;">Nota Final</th>
                <th class="center" style="width: 105px;">Promedio Curso</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <!-- 4. Resumen Final: Promedio General y Resumen de Asistencia -->
          <div class="report-summary-container sheet-summary">
            <!-- Tarjeta Promedio General del Alumno -->
            <div class="report-summary-card sheet-summary-card">
              <div class="summary-title title">Resumen Académico</div>
              <div class="big-average avg-display">
                <span>PROMEDIO GENERAL:</span>
                <span class="big-average-value avg-num" style="color: ${generalAverage !== null && generalAverage < 4.0 ? '#dc2626' : '#1e3a8a'};">
                  ${formattedGeneralAvg}
                </span>
              </div>
              <div style="font-size: 7pt; color: #64748b; margin-top: 2px;">
                Asignaturas evaluadas: <strong>${evaluatedCount} de ${allCourseSubjects.length}</strong>
              </div>
            </div>

            <!-- Tarjeta de Asistencia -->
            <div class="report-summary-card sheet-summary-card">
              <div class="summary-title title">Resumen de Asistencia Escolar</div>
              <div class="attendance-grid sheet-att-grid">
                <div class="att-item box">
                  <span style="display: block; font-size: 6.5pt; color: #475569;">DÍAS TRABAJADOS</span>
                  <span class="att-item-num num">${attendance.diasTrabajados}</span>
                </div>
                <div class="att-item box">
                  <span style="display: block; font-size: 6.5pt; color: #475569;">DÍAS ASISTIDOS</span>
                  <span class="att-item-num num">${attendance.diasAsistidos}</span>
                </div>
                <div class="att-item box" style="${isRiskAtt ? 'background: #fee2e2 !important;' : 'background: #ecfdf5 !important;'}">
                  <span style="display: block; font-size: 6.5pt; color: ${isRiskAtt ? '#b91c1c' : '#047857'};">% ASISTENCIA</span>
                  <span class="att-item-num num" style="color: ${isRiskAtt ? '#b91c1c' : '#047857'};">
                    ${attendance.porcentaje.toFixed(1).replace('.', ',')}%
                  </span>
                </div>
              </div>
              <div style="font-size: 6.8pt; color: ${isRiskAtt ? '#dc2626' : '#059669'}; margin-top: 3px; font-weight: 600; text-align: center;">
                ${isRiskAtt ? '⚠️ Asistencia inferior al mínimo reglamentario (85%)' : '✅ Asistencia reglamentaria conforme'}
              </div>
            </div>
          </div>

          <!-- 5. Zona de Firmas Estática Centrada -->
          <div class="report-signatures-block sheet-signatures">
            <div class="signature-box sheet-signature-box">
              <div class="signature-line sheet-signature-line"></div>
              <div class="signature-text sheet-signature-label">Firma Profesor(a) Jefe</div>
              <div class="signature-subtext">${escapeHtml(config.profesorJefe || 'Profesor(a) Jefe')}</div>
            </div>
            <div class="signature-box sheet-signature-box">
              <div class="signature-line sheet-signature-line"></div>
              <div class="signature-text sheet-signature-label">Firma Director</div>
              <div class="signature-subtext">${escapeHtml(config.director || 'Director(a) Establecimiento')}</div>
            </div>
          </div>

          <!-- Pequeño pie de página oficial -->
          <div class="report-footer-note" style="text-align: center; font-size: 6.5pt; color: #94a3b8; margin-top: 2px;">
            Documento Oficial del ${escapeHtml(config.nombre || 'Liceo Andrés Alcázar de Tucapel')} • Formato Carta (Letter)
          </div>
        </div>
      `;
    }

    renderPreview() {
      if (!this.container || !this.nivelSelect) return;

      const nivel = this.nivelSelect.value;
      const isBatch = this.modeRadioBatch && this.modeRadioBatch.checked;
      const config = db.getConfig();
      // Hasta 18 asignaturas para el plan de estudio
      const allCourseSubjects = ASIGNATURAS_CATALOGO.slice(0, 18);

      if (isBatch) {
        const students = db.getStudents(nivel);
        if (this.reportCountBadge) {
          this.reportCountBadge.textContent = `${students.length} informes en lote`;
        }

        if (students.length === 0) {
          this.container.innerHTML = `
            <div style="text-align: center; padding: 4rem 1rem; color: #cbd5e1; background: #1e293b; border-radius: 12px; width: 100%;">
              <div style="font-size: 3rem; margin-bottom: 0.5rem;">📄</div>
              <h3 style="color: #ffffff;">No hay estudiantes matriculados en ${nivel}</h3>
              <p style="color: #94a3b8; font-size: 0.9rem;">Matricule estudiantes en este nivel para generar los informes por lote.</p>
            </div>
          `;
          return;
        }

        const allPagesHtml = students.map(std => this.generateStudentReportHtml(std, config, allCourseSubjects)).join('');
        this.container.innerHTML = allPagesHtml;
      } else {
        const studentId = this.studentSelect ? this.studentSelect.value : null;
        const student = studentId ? db.getStudentById(studentId) : null;

        if (this.reportCountBadge) {
          this.reportCountBadge.textContent = student ? '1 informe individual' : '0 informes';
        }

        if (!student) {
          this.container.innerHTML = `
            <div style="text-align: center; padding: 4rem 1rem; color: #cbd5e1; background: #1e293b; border-radius: 12px; width: 100%;">
              <div style="font-size: 3rem; margin-bottom: 0.5rem;">👤</div>
              <h3 style="color: #ffffff;">Seleccione un estudiante</h3>
              <p style="color: #94a3b8; font-size: 0.9rem;">Elija un estudiante en el menú superior para ver su informe individual.</p>
            </div>
          `;
          return;
        }

        this.container.innerHTML = this.generateStudentReportHtml(student, config, allCourseSubjects);
      }
    }
  }

  function formatRut(rut, dv) {
    if (!rut) return '-';
    const sRut = String(rut);
    let result = '';
    let j = 0;
    for (let i = sRut.length - 1; i >= 0; i--) {
      result = sRut.charAt(i) + result;
      j++;
      if (j === 3 && i > 0) {
        result = '.' + result;
        j = 0;
      }
    }
    return `${result}-${dv || ''}`;
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
