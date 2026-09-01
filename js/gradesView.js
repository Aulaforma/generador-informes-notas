/**
 * js/gradesView.js
 * Módulo de Ingreso de Calificaciones (Vista Docente).
 * Cuadrícula de hasta 40 estudiantes con 12 notas editables y cálculo dinámico de:
 * - Promedio aritmético individual con regla de redondeo oficial chilena
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
  const ASIGNATURAS_CATALOGO = dbModule.ASIGNATURAS_CATALOGO;
  const formatGrade = dbModule.formatGrade;
  const roundToChileanGrade = dbModule.roundToChileanGrade;

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

      this.currentNivel = '';
      this.currentSubject = '';

      this.init();
    }

    init() {
      this.populateSelectors();
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

      if (this.subjectSelect && this.subjectSelect.options.length > 0) {
        this.subjectSelect.selectedIndex = 0;
        this.currentSubject = this.subjectSelect.value;
      }

      this.render();

      window.addEventListener('students_updated', () => {
        this.render();
      });
    }

    populateSelectors() {
      if (this.nivelSelect) {
        this.nivelSelect.innerHTML = NIVELES_DISPONIBLES.map(n => 
          `<option value="${n}">${n}</option>`
        ).join('');
      }

      if (this.subjectSelect) {
        this.subjectSelect.innerHTML = ASIGNATURAS_CATALOGO.map(s => 
          `<option value="${s}">${s}</option>`
        ).join('');
      }
    }

    initEvents() {
      if (this.nivelSelect) {
        this.nivelSelect.addEventListener('change', (e) => {
          this.currentNivel = e.target.value;
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
      if (!this.currentNivel || !this.currentSubject) return;

      const students = db.getStudents(this.currentNivel).slice(0, 40);

      if (students.length === 0) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="15" style="text-align: center; padding: 2.5rem; color: #64748b;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">📝</div>
              <strong>No hay estudiantes registrados en ${this.currentNivel}</strong>
              <p style="font-size: 0.85rem; margin-top: 0.25rem;">Vaya a la pestaña de "Matrícula" para inscribir estudiantes en este curso.</p>
            </td>
          </tr>
        `;
        this.updateKpis([], null);
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

        const avgColor = studentAvg !== null ? (studentAvg < 4.0 ? '#dc2626' : '#1e40af') : '#64748b';

        return `
          <tr data-student-id="${std.id}">
            <td style="color: #64748b; font-weight: 600;">${index + 1}</td>
            <td class="col-student">
              <span style="font-weight: 700; color: #0f172a;">${escapeHtml(std.apellidoPaterno)} ${escapeHtml(std.apellidoMaterno)}</span>, 
              <span style="color: #475569;">${escapeHtml(std.nombres)}</span>
            </td>
            ${cellsHtml}
            <td class="col-avg-cell" id="avg-cell-${std.id}" style="color: ${avgColor};">
              ${formatGrade(studentAvg)}
            </td>
          </tr>
        `;
      }).join('');

      this.tableBody.innerHTML = rowsHtml;

      const courseSubjectAvg = db.getCourseSubjectAverage(this.currentNivel, this.currentSubject);
      this.updateKpis(evaluatedStudentAverages, courseSubjectAvg);
    }

    handleGradeChange(inputEl) {
      const rawValue = inputEl.value.trim();
      const studentId = inputEl.getAttribute('data-student-id');
      const colIndex = parseInt(inputEl.getAttribute('data-col-index'), 10);

      let parsedVal = null;

      if (rawValue !== '') {
        let numStr = rawValue.replace(',', '.');
        if (/^[1-7][0-9]$/.test(numStr)) {
          numStr = numStr.charAt(0) + '.' + numStr.charAt(1);
        }

        const num = parseFloat(numStr);
        if (isNaN(num) || num < 1.0 || num > 7.0) {
          window.showToast('Nota inválida. Debe ser entre 1.0 y 7.0', 'danger');
          inputEl.value = '';
          inputEl.classList.remove('is-red', 'is-blue');
          return;
        }
        parsedVal = Math.round(num * 10) / 10;
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

      const avgCell = document.getElementById(`avg-cell-${studentId}`);
      if (avgCell) {
        avgCell.textContent = formatGrade(updated.promedio);
        avgCell.style.color = updated.promedio !== null ? (updated.promedio < 4.0 ? '#dc2626' : '#1e40af') : '#64748b';
      }

      const courseAvg = db.getCourseSubjectAverage(this.currentNivel, this.currentSubject);
      const students = db.getStudents(this.currentNivel);
      const evaluatedAverages = students
        .map(s => db.getGradesForStudentAndSubject(s.id, this.currentSubject)?.promedio)
        .filter(p => p !== null && p !== undefined);

      this.updateKpis(evaluatedAverages, courseAvg);
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

    updateKpis(evaluatedList, courseAvg) {
      const formattedAvg = formatGrade(courseAvg);
      
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
