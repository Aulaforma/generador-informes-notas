/**
 * js/gradesView.js
 * Módulo de Ingreso de Calificaciones (Vista Docente).
 * Cuadrícula de hasta 40 estudiantes con 12 notas editables y cálculo dinámico de:
 * - Promedio individual (escala numérica o escala conceptual I, S, B, MB)
 * - Identificación de asignaturas que no inciden en el promedio con asterisco (*)
 * - Promedio General del Curso en tiempo real
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.GradesView = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule) {

  const db = dbModule.db;
  const NIVELES_DISPONIBLES = dbModule.NIVELES_DISPONIBLES;
  const formatGrade = dbModule.formatGrade;
  const roundToChileanGrade = dbModule.roundToChileanGrade;
  const convertToConcept = dbModule.convertToConcept;
  const getConceptDescription = dbModule.getConceptDescription;
  const isTypicallyConceptual = dbModule.isTypicallyConceptual;

  class GradesView {
    constructor() {
      this.nivelSelect = document.getElementById('grades-select-nivel');
      this.subjectSelect = document.getElementById('grades-select-subject');
      this.tableBody = document.getElementById('grades-table-body');
      
      // KPI Badges
      this.kpiCourseAvg = document.getElementById('kpi-course-avg');
      this.kpiEvaluatedCount = document.getElementById('kpi-evaluated-count');
      this.kpiApprovedCount = document.getElementById('kpi-approved-count');
      this.kpiFailedCount = document.getElementById('kpi-failed-count');
      this.footerCourseAvg = document.getElementById('footer-course-avg');
      this.subjectInfoBanner = document.getElementById('grades-subject-info-banner');

      this.currentNivel = '';
      this.currentSubject = '';

      this.init();
    }

    init() {
      this.populateNivelSelect();
      this.initEvents();
      
      if (this.nivelSelect && this.nivelSelect.options.length > 0) {
        const p1Option = Array.from(this.nivelSelect.options).find(o => o.value === 'Primero Básico A');
        if (p1Option) {
          this.nivelSelect.value = 'Primero Básico A';
        } else {
          this.nivelSelect.selectedIndex = 0;
        }
        this.currentNivel = this.nivelSelect.value;
      }

      this.updateSubjectDropdown();
      this.render();

      window.addEventListener('students_updated', () => {
        this.render();
      });

      window.addEventListener('subjects_updated', () => {
        this.updateSubjectDropdown();
        this.render();
      });

      window.addEventListener('courses_updated', () => {
        this.populateNivelSelect();
        this.updateSubjectDropdown();
        this.render();
      });
    }

    populateNivelSelect() {
      if (this.nivelSelect) {
        const courseNames = db.getCourseNames();
        if (courseNames.length === 0) {
          this.nivelSelect.innerHTML = '<option value="">(No hay cursos creados)</option>';
          this.currentNivel = '';
          return;
        }

        this.nivelSelect.innerHTML = courseNames.map(n => 
          `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`
        ).join('');

        if (this.currentNivel && courseNames.includes(this.currentNivel)) {
          this.nivelSelect.value = this.currentNivel;
        } else {
          this.nivelSelect.selectedIndex = 0;
          this.currentNivel = this.nivelSelect.value;
        }
      }
    }

    updateSubjectDropdown() {
      if (!this.subjectSelect || !this.currentNivel) return;

      const courseSubjects = db.getSubjectsForCourse(this.currentNivel);

      if (courseSubjects.length === 0) {
        this.subjectSelect.innerHTML = '<option value="">(Sin asignaturas configuradas)</option>';
        this.subjectSelect.disabled = true;
        this.currentSubject = '';
        return;
      }

      this.subjectSelect.disabled = false;
      const previousSelection = this.currentSubject;

      this.subjectSelect.innerHTML = courseSubjects.map(s => {
        const noIncide = s.incideEnPromedio === false;
        const conceptual = s.esConceptual || isTypicallyConceptual(s.nombre);
        const tagIncide = noIncide ? ' (* No incide)' : '';
        const tagConcept = conceptual ? ' [Conceptos I-S-B-MB]' : '';
        const label = `${s.nombre}${tagIncide}${tagConcept}`;
        return `<option value="${escapeHtml(s.nombre)}">${label}</option>`;
      }).join('');

      // Mantener selección anterior si sigue existiendo
      const exists = courseSubjects.some(s => s.nombre === previousSelection);
      if (exists) {
        this.subjectSelect.value = previousSelection;
      } else {
        this.subjectSelect.selectedIndex = 0;
      }
      this.currentSubject = this.subjectSelect.value;
    }

    getCurrentSubjectConfig() {
      if (!this.currentNivel || !this.currentSubject) return null;
      const list = db.getSubjectsForCourse(this.currentNivel);
      return list.find(s => s.nombre === this.currentSubject) || {
        nombre: this.currentSubject,
        incideEnPromedio: true,
        esConceptual: isTypicallyConceptual(this.currentSubject)
      };
    }

    initEvents() {
      if (this.nivelSelect) {
        this.nivelSelect.addEventListener('change', (e) => {
          this.currentNivel = e.target.value;
          this.updateSubjectDropdown();
          this.render();
        });
      }

      if (this.subjectSelect) {
        this.subjectSelect.addEventListener('change', (e) => {
          this.currentSubject = e.target.value;
          this.render();
        });
      }

      if (this.tableBody) {
        this.tableBody.addEventListener('change', (e) => {
          if (e.target.classList.contains('grade-input')) {
            this.handleGradeChange(e.target);
          }
        });

        this.tableBody.addEventListener('keydown', (e) => {
          if (e.target.classList.contains('grade-input')) {
            this.handleGridNavigation(e);
          }
        });
      }
    }

    render() {
      if (!this.currentNivel) return;

      const subConfig = this.getCurrentSubjectConfig();
      const isConceptual = subConfig ? subConfig.esConceptual : false;
      const noIncide = subConfig ? subConfig.incideEnPromedio === false : false;

      // Actualizar banner informativo sobre la asignatura seleccionada
      this.updateSubjectBanner(subConfig);

      if (!this.currentSubject) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="15" style="text-align: center; padding: 2.5rem; color: #64748b;">
              <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📚</div>
              <strong>No hay asignaturas configuradas para ${escapeHtml(this.currentNivel)}</strong>
              <p style="font-size: 0.85rem; margin-top: 0.4rem;">Vaya a la pestaña "📚 Asignaturas por Curso" para escribir las asignaturas que componen el plan de estudios.</p>
              <button class="btn btn-primary btn-sm" style="margin-top: 0.75rem;" onclick="document.getElementById('tab-btn-subjects').click()">
                ➕ Configurar Asignaturas de este Curso
              </button>
            </td>
          </tr>
        `;
        this.updateKpis([], null, isConceptual);
        return;
      }

      const students = db.getStudents(this.currentNivel).slice(0, 40);

      if (students.length === 0) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="15" style="text-align: center; padding: 2.5rem; color: #64748b;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">📝</div>
              <strong>No hay estudiantes matriculados en ${escapeHtml(this.currentNivel)}</strong>
              <p style="font-size: 0.85rem; margin-top: 0.25rem;">Vaya a la pestaña de "Matrícula" para inscribir estudiantes o hacer carga masiva.</p>
            </td>
          </tr>
        `;
        this.updateKpis([], null, isConceptual);
        return;
      }

      let evaluatedStudentAverages = [];

      const rowsHtml = students.map((std, index) => {
        const gradeRecord = db.getGradesForStudentAndSubject(std.id, this.currentSubject);
        const notes = (gradeRecord && gradeRecord.notes) ? gradeRecord.notes : Array(12).fill(null);
        const studentAvg = (gradeRecord && gradeRecord.promedio !== null && gradeRecord.promedio !== undefined) ? gradeRecord.promedio : null;

        if (studentAvg !== null) {
          evaluatedStudentAverages.push(studentAvg);
        }

        const cellsHtml = Array.from({ length: 12 }).map((_, cIdx) => {
          const val = notes[cIdx];
          const displayVal = val !== null && val !== undefined && val !== '' ? String(val).replace('.', ',') : '';
          const numVal = parseFloat(String(val).replace(',', '.'));
          const colorClass = !isNaN(numVal) && numVal > 0 ? (numVal < 4.0 ? 'is-red' : 'is-blue') : '';

          return `
            <td>
              <input 
                type="text" 
                class="grade-input ${colorClass}" 
                data-student-id="${std.id}" 
                data-col-index="${cIdx}" 
                value="${displayVal}" 
                maxlength="4" 
                placeholder="-" 
                autocomplete="off"
              />
            </td>
          `;
        }).join('');

        let avgDisplayHtml = '-';
        let avgColor = '#64748b';

        if (studentAvg !== null) {
          if (isConceptual) {
            const concept = convertToConcept(studentAvg);
            const conceptColor = concept === 'I' ? '#dc2626' : (concept === 'MB' ? '#1e40af' : '#059669');
            avgColor = conceptColor;
            avgDisplayHtml = `
              <strong style="font-size: 1.15rem; color: ${conceptColor};">${concept}</strong>
              <span style="font-size: 0.72rem; display: block; color: #64748b;">(${formatGrade(studentAvg)})</span>
            `;
          } else {
            avgColor = studentAvg < 4.0 ? '#dc2626' : '#1e40af';
            avgDisplayHtml = formatGrade(studentAvg);
          }
        }

        return `
          <tr data-student-id="${std.id}">
            <td style="color: #64748b; font-weight: 600;">${index + 1}</td>
            <td class="col-student">
              <span style="font-weight: 700; color: #0f172a;">${escapeHtml(std.apellidoPaterno)} ${escapeHtml(std.apellidoMaterno)}</span>, 
              <span style="color: #475569;">${escapeHtml(std.nombres)}</span>
            </td>
            ${cellsHtml}
            <td class="col-avg-cell" id="avg-cell-${std.id}" style="color: ${avgColor};">
              ${avgDisplayHtml}
            </td>
          </tr>
        `;
      }).join('');

      this.tableBody.innerHTML = rowsHtml;

      const courseSubjectAvg = db.getCourseSubjectAverage(this.currentNivel, this.currentSubject);
      this.updateKpis(evaluatedStudentAverages, courseSubjectAvg, isConceptual);
    }

    updateSubjectBanner(subConfig) {
      if (!this.subjectInfoBanner) return;

      if (!subConfig) {
        this.subjectInfoBanner.style.display = 'none';
        return;
      }

      const noIncide = subConfig.incideEnPromedio === false;
      const isConceptual = subConfig.esConceptual;

      let html = '';
      if (noIncide) {
        html += `<span class="header-badge-tag" style="background: #fef3c7; color: #92400e; font-weight: 700; margin-right: 0.5rem;">⚠️ Asignatura con Asterisco (*)</span> <span>Esta asignatura <strong>no incide</strong> en el cálculo del Promedio General del estudiante.</span> `;
      }
      if (isConceptual) {
        html += `<span class="header-badge-tag" style="background: #f3e8ff; color: #6b21a8; font-weight: 700; margin-left: 0.5rem; margin-right: 0.5rem;">✨ Escala Conceptual</span> <span>Las notas pasan automáticamente a conceptos: <strong>MB</strong> (6,0-7,0 Muy Bien), <strong>B</strong> (5,0-5,9 Bien), <strong>S</strong> (4,0-4,9 Suficiente), <strong>I</strong> (1,0-3,9 Insuficiente).</span>`;
      }

      if (html) {
        this.subjectInfoBanner.innerHTML = html;
        this.subjectInfoBanner.style.display = 'flex';
      } else {
        this.subjectInfoBanner.style.display = 'none';
      }
    }

    handleGradeChange(inputEl) {
      const rawValue = inputEl.value.trim();
      const studentId = inputEl.getAttribute('data-student-id');
      const colIndex = parseInt(inputEl.getAttribute('data-col-index'), 10);
      const subConfig = this.getCurrentSubjectConfig();
      const isConceptual = subConfig ? subConfig.esConceptual : false;

      let parsedVal = null;

      if (rawValue !== '') {
        // Permitir también tipear conceptos directamente: MB, B, S, I y convertirlos a notas representativas
        const upper = rawValue.toUpperCase();
        if (upper === 'MB') parsedVal = 6.5;
        else if (upper === 'B') parsedVal = 5.5;
        else if (upper === 'S') parsedVal = 4.5;
        else if (upper === 'I') parsedVal = 3.5;
        else {
          let numStr = rawValue.replace(',', '.');
          if (/^[1-7][0-9]$/.test(numStr)) {
            numStr = numStr.charAt(0) + '.' + numStr.charAt(1);
          }

          const num = parseFloat(numStr);
          if (isNaN(num) || num < 1.0 || num > 7.0) {
            window.showToast('Nota inválida. Debe ser entre 1.0 y 7.0 (o conceptos MB, B, S, I)', 'danger');
            inputEl.value = '';
            inputEl.classList.remove('is-red', 'is-blue');
            return;
          }
          parsedVal = Math.round(num * 10) / 10;
        }

        inputEl.value = parsedVal.toFixed(1).replace('.', ',');
        inputEl.classList.remove('is-red', 'is-blue');
        inputEl.classList.add(parsedVal < 4.0 ? 'is-red' : 'is-blue');
      } else {
        inputEl.value = '';
        inputEl.classList.remove('is-red', 'is-blue');
      }

      const currentRecord = db.getGradesForStudentAndSubject(studentId, this.currentSubject);
      let notes = (currentRecord && currentRecord.notes) ? [...currentRecord.notes] : Array(12).fill(null);
      while (notes.length < 12) notes.push(null);

      notes[colIndex] = parsedVal;

      const updated = db.saveStudentGrades(studentId, this.currentSubject, notes);

      // Actualizar celda de promedio individual
      const avgCell = document.getElementById(`avg-cell-${studentId}`);
      if (avgCell) {
        if (updated.promedio !== null) {
          if (isConceptual) {
            const concept = convertToConcept(updated.promedio);
            const conceptColor = concept === 'I' ? '#dc2626' : (concept === 'MB' ? '#1e40af' : '#059669');
            avgCell.style.color = conceptColor;
            avgCell.innerHTML = `
              <strong style="font-size: 1.15rem; color: ${conceptColor};">${concept}</strong>
              <span style="font-size: 0.72rem; display: block; color: #64748b;">(${formatGrade(updated.promedio)})</span>
            `;
          } else {
            avgCell.style.color = updated.promedio < 4.0 ? '#dc2626' : '#1e40af';
            avgCell.textContent = formatGrade(updated.promedio);
          }
        } else {
          avgCell.textContent = '-';
          avgCell.style.color = '#64748b';
        }
      }

      const courseAvg = db.getCourseSubjectAverage(this.currentNivel, this.currentSubject);
      const students = db.getStudents(this.currentNivel);
      const evaluatedAverages = students
        .map(s => db.getGradesForStudentAndSubject(s.id, this.currentSubject)?.promedio)
        .filter(p => p !== null && p !== undefined);

      this.updateKpis(evaluatedAverages, courseAvg, isConceptual);
    }

    handleGridNavigation(e) {
      const input = e.target;
      const currentCol = parseInt(input.getAttribute('data-col-index'), 10);
      const currentRow = input.closest('tr');

      if (e.key === 'ArrowRight') {
        if (input.selectionEnd === input.value.length && currentCol < 11) {
          const nextInput = currentRow.querySelector(`input[data-col-index="${currentCol + 1}"]`);
          if (nextInput) { nextInput.focus(); nextInput.select(); e.preventDefault(); }
        }
      } else if (e.key === 'ArrowLeft') {
        if (input.selectionStart === 0 && currentCol > 0) {
          const prevInput = currentRow.querySelector(`input[data-col-index="${currentCol - 1}"]`);
          if (prevInput) { prevInput.focus(); prevInput.select(); e.preventDefault(); }
        }
      } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
        const nextRow = currentRow.nextElementSibling;
        if (nextRow) {
          const nextInput = nextRow.querySelector(`input[data-col-index="${currentCol}"]`);
          if (nextInput) { nextInput.focus(); nextInput.select(); e.preventDefault(); }
        }
      } else if (e.key === 'ArrowUp') {
        const prevRow = currentRow.previousElementSibling;
        if (prevRow) {
          const prevInput = prevRow.querySelector(`input[data-col-index="${currentCol}"]`);
          if (prevInput) { prevInput.focus(); prevInput.select(); e.preventDefault(); }
        }
      }
    }

    updateKpis(evaluatedList, courseAvg, isConceptual = false) {
      let formattedAvg = '-';

      if (courseAvg !== null) {
        if (isConceptual) {
          formattedAvg = `${convertToConcept(courseAvg)} (${formatGrade(courseAvg)})`;
        } else {
          formattedAvg = formatGrade(courseAvg);
        }
      }
      
      if (this.kpiCourseAvg) {
        this.kpiCourseAvg.textContent = formattedAvg;
        this.kpiCourseAvg.style.color = courseAvg !== null ? (courseAvg < 4.0 ? '#dc2626' : '#1e3a8a') : '#64748b';
      }

      if (this.footerCourseAvg) {
        this.footerCourseAvg.textContent = formattedAvg;
      }

      if (this.kpiEvaluatedCount) {
        this.kpiEvaluatedCount.textContent = evaluatedList.length;
      }

      const approved = evaluatedList.filter(p => p >= 4.0).length;
      const failed = evaluatedList.filter(p => p < 4.0).length;

      if (this.kpiApprovedCount) this.kpiApprovedCount.textContent = approved;
      if (this.kpiFailedCount) this.kpiFailedCount.textContent = failed;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return GradesView;
});
