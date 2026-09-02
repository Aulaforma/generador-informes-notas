/**
 * js/gradesView.js
 * Módulo de Gestión de Calificaciones Docente con Soporte para 1° y 2° Semestre.
 * Permite registrar hasta 12 notas por semestre, calculando en tiempo real
 * los promedios semestrales y el Promedio Final Anual con redondeo oficial MINEDUC.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'), require('./seedData.js'));
  } else {
    root.GradesView = factory(root, root);
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
      
      // Botones de selección de semestre
      this.btnSemester1 = document.getElementById('btn-semester-1');
      this.btnSemester2 = document.getElementById('btn-semester-2');
      this.thSemAvg = document.getElementById('th-sem-avg');

      // KPI Badges y Footer
      this.kpiCourseAvg = document.getElementById('kpi-course-avg');
      this.kpiLabelCourseAvg = document.getElementById('kpi-label-course-avg');
      this.kpiEvaluatedCount = document.getElementById('kpi-evaluated-count');
      this.kpiApprovedCount = document.getElementById('kpi-approved-count');
      this.kpiFailedCount = document.getElementById('kpi-failed-count');
      this.footerCourseAvg = document.getElementById('footer-course-avg');
      this.footerCourseFinalAvg = document.getElementById('footer-course-final-avg');
      this.subjectInfoBanner = document.getElementById('grades-subject-info-banner');

      this.currentNivel = '';
      this.currentSubject = '';
      this.currentSemestre = 1; // 1 o 2

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

      let gradesDebounceTimer = null;
      const debouncedRenderGrades = () => {
        if (gradesDebounceTimer) clearTimeout(gradesDebounceTimer);
        gradesDebounceTimer = setTimeout(() => {
          this.render();
        }, 60);
      };

      window.addEventListener('students_updated', () => {
        debouncedRenderGrades();
      });

      window.addEventListener('subjects_updated', () => {
        this.updateSubjectDropdown();
        debouncedRenderGrades();
      });

      window.addEventListener('courses_updated', () => {
        this.populateNivelSelect();
        this.updateSubjectDropdown();
        debouncedRenderGrades();
      });

      window.addEventListener('cloud-data-updated', () => {
        this.populateNivelSelect();
        this.updateSubjectDropdown();
        debouncedRenderGrades();
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

        this.nivelSelect.innerHTML = courseNames.map(c => 
          `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
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
        const tagCode = s.codigo ? `[Cód. ${s.codigo}] ` : '';
        const noIncide = s.incideEnPromedio === false;
        const conceptual = s.esConceptual || isTypicallyConceptual(s.nombre);
        const tagIncide = noIncide ? ' (* No incide)' : '';
        const tagConcept = conceptual ? ' [Conceptos I-S-B-MB]' : '';
        const hasFantasia = Boolean(s.nombreFantasia && s.nombreFantasia.trim() !== '');

        let label = '';
        if (hasFantasia) {
          label = `🏷️ ${s.nombreFantasia} (JEC ${tagCode}${s.nombre})${tagIncide}${tagConcept}`;
        } else {
          label = `${tagCode}${s.nombre}${tagIncide}${tagConcept}`;
        }

        return `<option value="${escapeHtml(s.nombre)}">${escapeHtml(label)}</option>`;
      }).join('');

      // Mantener selección anterior si sigue existiendo
      const exists = courseSubjects.some(s => s.nombre === previousSelection);
      if (exists) {
        this.subjectSelect.value = previousSelection;
      } else {
        this.subjectSelect.selectedIndex = 0;
        this.currentSubject = this.subjectSelect.value;
      }
    }

    setSemestre(sem) {
      this.currentSemestre = Number(sem) || 1;

      if (this.btnSemester1 && this.btnSemester2) {
        if (this.currentSemestre === 1) {
          this.btnSemester1.classList.add('active');
          this.btnSemester1.style.background = '#3b82f6';
          this.btnSemester1.style.color = 'white';

          this.btnSemester2.classList.remove('active');
          this.btnSemester2.style.background = '#f8fafc';
          this.btnSemester2.style.color = '#334155';
        } else {
          this.btnSemester2.classList.add('active');
          this.btnSemester2.style.background = '#ea580c';
          this.btnSemester2.style.color = 'white';

          this.btnSemester1.classList.remove('active');
          this.btnSemester1.style.background = '#f8fafc';
          this.btnSemester1.style.color = '#334155';
        }
      }

      if (this.thSemAvg) {
        this.thSemAvg.textContent = `PROM. ${this.currentSemestre}° SEM`;
        this.thSemAvg.style.background = this.currentSemestre === 1 ? '#dbeafe' : '#ffedd5';
        this.thSemAvg.style.color = this.currentSemestre === 1 ? '#1e40af' : '#9a3412';
      }

      if (this.kpiLabelCourseAvg) {
        this.kpiLabelCourseAvg.textContent = `Promedio Curso (${this.currentSemestre}° Sem)`;
      }

      this.render();
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

      // Alternar 1er Semestre y 2do Semestre
      if (this.btnSemester1) {
        this.btnSemester1.addEventListener('click', () => {
          this.setSemestre(1);
        });
      }

      if (this.btnSemester2) {
        this.btnSemester2.addEventListener('click', () => {
          this.setSemestre(2);
        });
      }

      if (this.tableBody) {
        this.tableBody.addEventListener('change', (e) => {
          if (e.target.classList.contains('grade-input')) {
            this.handleGradeInput(e.target);
          }
        });

        this.tableBody.addEventListener('keydown', (e) => {
          if (e.target.classList.contains('grade-input')) {
            this.handleGridNavigation(e);
          }
        });
      }
    }

    getCurrentSubjectConfig() {
      if (!this.currentNivel || !this.currentSubject) return null;
      const subjects = db.getSubjectsForCourse(this.currentNivel);
      return subjects.find(s => s.nombre === this.currentSubject) || null;
    }

    render() {
      if (!this.tableBody) return;

      const subConfig = this.getCurrentSubjectConfig();
      const noIncide = subConfig ? subConfig.incideEnPromedio === false : false;
      const isConceptual = subConfig ? subConfig.esConceptual : isTypicallyConceptual(this.currentSubject);

      if (!this.currentNivel || !this.currentSubject) {
        if (this.subjectInfoBanner) this.subjectInfoBanner.style.display = 'none';
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="16" style="text-align: center; padding: 2.5rem; color: #64748b;">
              <strong>Seleccione un Nivel y una Asignatura para ingresar calificaciones</strong>
            </td>
          </tr>
        `;
        this.updateKpis([], null, null, isConceptual);
        return;
      }

      // Cargar TODOS los estudiantes del curso (sin límite arbitrario)
      const students = db.getStudents(this.currentNivel);

      // Actualizar banner informativo
      if (this.subjectInfoBanner) {
        const semTag = `<span class="header-badge-tag" style="background: ${this.currentSemestre === 1 ? '#dbeafe' : '#ffedd5'}; color: ${this.currentSemestre === 1 ? '#1e40af' : '#9a3412'}; font-weight: 700;">📅 ${this.currentSemestre}° Semestre Activo</span>`;
        const codeTag = subConfig && subConfig.codigo ? `<span class="header-badge-tag" style="background: #e2e8f0; color: #1e293b; font-family: monospace; font-weight: 700;">Cód. ${escapeHtml(subConfig.codigo)}</span>` : '';
        const countTag = `<span class="header-badge-tag" style="background: #eff6ff; color: #1d4ed8; font-weight: 700;">👨‍🎓 ${students.length} Estudiantes Matriculados</span>`;
        const incideTag = noIncide 
          ? `<span class="header-badge-tag" style="background: #fef3c7; color: #92400e; font-weight: 700;">⚠️ No incide en promedio final (*)</span>` 
          : `<span class="header-badge-tag" style="background: #ecfdf5; color: #065f46; font-weight: 600;">✓ Incide en promedio general</span>`;
        const conceptTag = isConceptual
          ? `<span class="header-badge-tag" style="background: #f3e8ff; color: #6b21a8; font-weight: 700;">✨ Escala Conceptual (I: 1.0-3.9 | S: 4.0-4.9 | B: 5.0-5.9 | MB: 6.0-7.0)</span>`
          : `<span class="header-badge-tag" style="background: #eff6ff; color: #1e40af; font-weight: 600;">🔢 Escala Numérica (1.0 a 7.0)</span>`;

        this.subjectInfoBanner.innerHTML = `
          ${semTag}
          ${codeTag}
          <strong style="color: #1e3a8a; font-size: 0.95rem;">${escapeHtml(this.currentSubject)}${noIncide ? ' *' : ''}</strong>
          ${countTag}
          ${incideTag}
          ${conceptTag}
        `;
        this.subjectInfoBanner.style.display = 'flex';
      }

      if (students.length === 0) {
        this.tableBody.innerHTML = `
          <tr>
            <td colspan="16" style="text-align: center; padding: 2.5rem; color: #64748b;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">📝</div>
              <strong>No hay estudiantes matriculados en ${escapeHtml(this.currentNivel)}</strong>
              <p style="font-size: 0.85rem; margin-top: 0.25rem;">Vaya a la pestaña de "Matrícula" para inscribir estudiantes o hacer carga masiva.</p>
            </td>
          </tr>
        `;
        this.updateKpis([], null, null, isConceptual);
        return;
      }

      let evaluatedStudentAverages = [];

      const rowsHtml = students.map((std, index) => {
        // Obtener calificaciones del semestre activo (10 evaluaciones por semestre)
        const gradeRecord = db.getGradesForStudentAndSubject(std.id, this.currentSubject, this.currentSemestre);
        const notes = (gradeRecord && gradeRecord.notes) ? gradeRecord.notes : Array(10).fill(null);
        const studentSemAvg = (gradeRecord && gradeRecord.promedio !== null && gradeRecord.promedio !== undefined) ? gradeRecord.promedio : null;

        // Obtener promedio final anual proyectado (combinando 1S y 2S)
        const finalObj = db.getStudentSubjectFinalGrade(std.id, this.currentSubject);

        if (studentSemAvg !== null) {
          evaluatedStudentAverages.push(studentSemAvg);
        }

        const cellsHtml = Array.from({ length: 10 }).map((_, cIdx) => {
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

        // Formato para el promedio del semestre activo
        let avgSemDisplayHtml = '-';
        let avgSemColor = '#64748b';

        if (studentSemAvg !== null) {
          if (isConceptual) {
            const concept = convertToConcept(studentSemAvg);
            const conceptColor = concept === 'I' ? '#dc2626' : (concept === 'MB' ? '#1e40af' : '#059669');
            avgSemColor = conceptColor;
            avgSemDisplayHtml = `
              <strong style="font-size: 1.15rem; color: ${conceptColor};">${concept}</strong>
              <span style="font-size: 0.72rem; display: block; color: #64748b;">(${formatGrade(studentSemAvg)})</span>
            `;
          } else {
            avgSemColor = studentSemAvg < 4.0 ? '#dc2626' : '#1e40af';
            avgSemDisplayHtml = formatGrade(studentSemAvg);
          }
        }

        // Formato para el promedio final anual
        let avgFinalDisplayHtml = '-';
        let avgFinalColor = '#64748b';

        if (finalObj.promedioFinal !== null) {
          if (isConceptual) {
            const concept = convertToConcept(finalObj.promedioFinal);
            const conceptColor = concept === 'I' ? '#dc2626' : (concept === 'MB' ? '#1e40af' : '#059669');
            avgFinalColor = conceptColor;
            avgFinalDisplayHtml = `
              <strong style="font-size: 1.15rem; color: ${conceptColor};">${concept}</strong>
            `;
          } else {
            avgFinalColor = finalObj.promedioFinal < 4.0 ? '#dc2626' : '#1e40af';
            avgFinalDisplayHtml = formatGrade(finalObj.promedioFinal);
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
            <td class="col-avg-cell" id="avg-cell-${std.id}" style="color: ${avgSemColor}; background: ${this.currentSemestre === 1 ? '#eff6ff' : '#fff7ed'}; font-weight: 800;">
              ${avgSemDisplayHtml}
            </td>
            <td class="col-avg-cell" id="final-cell-${std.id}" style="color: ${avgFinalColor}; background: #f8fafc; font-weight: 800; border-left: 2px solid #cbd5e1;">
              ${avgFinalDisplayHtml}
            </td>
          </tr>
        `;
      }).join('');

      this.tableBody.innerHTML = rowsHtml;

      const courseSemAvg = db.getCourseSubjectAverage(this.currentNivel, this.currentSubject, this.currentSemestre);
      const courseFinalAvg = db.getCourseSubjectAverage(this.currentNivel, this.currentSubject, 'anual');
      this.updateKpis(evaluatedStudentAverages, courseSemAvg, courseFinalAvg, isConceptual);
    }

    updateKpis(studentAverages, courseSemAvg, courseFinalAvg, isConceptual) {
      const evaluatedCount = studentAverages.length;
      let approvedCount = 0;
      let failedCount = 0;

      studentAverages.forEach(avg => {
        if (avg >= 4.0) approvedCount++;
        else failedCount++;
      });

      if (this.kpiCourseAvg) {
        if (courseSemAvg !== null) {
          if (isConceptual) {
            const concept = convertToConcept(courseSemAvg);
            this.kpiCourseAvg.innerHTML = `${concept} <span style="font-size: 0.85rem; font-weight: 500;">(${formatGrade(courseSemAvg)})</span>`;
          } else {
            this.kpiCourseAvg.textContent = formatGrade(courseSemAvg);
          }
        } else {
          this.kpiCourseAvg.textContent = '-';
        }
      }

      if (this.kpiEvaluatedCount) this.kpiEvaluatedCount.textContent = evaluatedCount;
      if (this.kpiApprovedCount) this.kpiApprovedCount.textContent = approvedCount;
      if (this.kpiFailedCount) this.kpiFailedCount.textContent = failedCount;

      if (this.footerCourseAvg) {
        if (courseSemAvg !== null) {
          this.footerCourseAvg.textContent = isConceptual ? convertToConcept(courseSemAvg) : formatGrade(courseSemAvg);
        } else {
          this.footerCourseAvg.textContent = '-';
        }
      }

      if (this.footerCourseFinalAvg) {
        if (courseFinalAvg !== null) {
          this.footerCourseFinalAvg.textContent = isConceptual ? convertToConcept(courseFinalAvg) : formatGrade(courseFinalAvg);
        } else {
          this.footerCourseFinalAvg.textContent = '-';
        }
      }
    }

    handleGradeInput(inputEl) {
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

      // Guardar nota en el semestre activo (10 evaluaciones por semestre)
      const currentRecord = db.getGradesForStudentAndSubject(studentId, this.currentSubject, this.currentSemestre);
      let notes = (currentRecord && currentRecord.notes) ? [...currentRecord.notes] : Array(10).fill(null);
      while (notes.length < 10) notes.push(null);
      notes = notes.slice(0, 10);

      notes[colIndex] = parsedVal;

      const updated = db.saveStudentGrades(studentId, this.currentSubject, notes, this.currentSemestre);

      // Actualizar celda de promedio del semestre activo
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

      // Actualizar celda de promedio final anual
      const finalObj = db.getStudentSubjectFinalGrade(studentId, this.currentSubject);
      const finalCell = document.getElementById(`final-cell-${studentId}`);
      if (finalCell) {
        if (finalObj.promedioFinal !== null) {
          if (isConceptual) {
            const concept = convertToConcept(finalObj.promedioFinal);
            const conceptColor = concept === 'I' ? '#dc2626' : (concept === 'MB' ? '#1e40af' : '#059669');
            finalCell.style.color = conceptColor;
            finalCell.innerHTML = `<strong style="font-size: 1.15rem; color: ${conceptColor};">${concept}</strong>`;
          } else {
            finalCell.style.color = finalObj.promedioFinal < 4.0 ? '#dc2626' : '#1e40af';
            finalCell.textContent = formatGrade(finalObj.promedioFinal);
          }
        } else {
          finalCell.textContent = '-';
          finalCell.style.color = '#64748b';
        }
      }

      // Actualizar promedios globales de curso
      const courseSemAvg = db.getCourseSubjectAverage(this.currentNivel, this.currentSubject, this.currentSemestre);
      const courseFinalAvg = db.getCourseSubjectAverage(this.currentNivel, this.currentSubject, 'anual');
      const students = db.getStudents(this.currentNivel);
      const evaluatedAverages = students
        .map(s => db.getGradesForStudentAndSubject(s.id, this.currentSubject, this.currentSemestre)?.promedio)
        .filter(p => p !== null && p !== undefined);

      this.updateKpis(evaluatedAverages, courseSemAvg, courseFinalAvg, isConceptual);
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
