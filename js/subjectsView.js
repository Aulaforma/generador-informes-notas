/**
 * js/subjectsView.js
 * Módulo de Gestión de Cursos, Asignación de Profesores Jefe y Asignaturas por Curso.
 * Permite:
 * 1. Crear cursos dinámicamente y asignarles su Profesor(a) Jefe titular.
 * 2. Seleccionar cursos en desplegable y agregarles asignaturas personalizadas.
 * 3. Diferenciar asignaturas que no inciden con asterisco (*) y que quedan fuera del promedio general.
 * 4. Configurar escala conceptual (I, S, B, MB) para Orientación, Religión u otras.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.SubjectsView = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function (dbModule) {

  const db = dbModule.db;
  const isTypicallyConceptual = dbModule.isTypicallyConceptual;

  class SubjectsView {
    constructor() {
      // 1. Elementos de Creación y Gestión de Cursos
      this.courseForm = document.getElementById('course-add-form');
      this.courseNameInput = document.getElementById('course-input-name');
      this.courseProfesorInput = document.getElementById('course-input-profesor');
      this.coursesTableBody = document.getElementById('courses-table-body');
      this.coursesTotalBadge = document.getElementById('courses-total-badge');
      this.btnLoadOfficialCatalog = document.getElementById('btn-load-official-catalog');

      // 2. Elementos de Asignaturas por Curso
      this.nivelSelect = document.getElementById('subjects-select-nivel');
      this.courseCurrentPjBadge = document.getElementById('course-current-pj-badge');
      this.subjectForm = document.getElementById('subject-add-form');
      this.subjectNameInput = document.getElementById('subject-input-name');
      this.incideCheckbox = document.getElementById('subject-check-incide');
      this.conceptualCheckbox = document.getElementById('subject-check-conceptual');
      this.listContainer = document.getElementById('subjects-list-container');
      this.countBadge = document.getElementById('subjects-count-badge');
      
      // Herramienta de copiado entre cursos
      this.copyFromSelect = document.getElementById('copy-subjects-from-select');
      this.btnCopySubjects = document.getElementById('btn-copy-subjects');

      this.currentNivel = '';

      this.init();
    }

    init() {
      this.populateNivelSelects();
      this.initEvents();

      const courses = db.getCourses();
      if (courses.length > 0) {
        this.currentNivel = courses[0].nombre;
        if (this.nivelSelect) {
          this.nivelSelect.value = this.currentNivel;
        }
      }

      this.renderCoursesTable();
      this.renderSubjects();

      // Escuchar eventos globales de sincronización
      window.addEventListener('courses_updated', () => {
        this.populateNivelSelects();
        this.renderCoursesTable();
        this.renderSubjects();
      });

      window.addEventListener('subjects_updated', (e) => {
        if (!e.detail || !e.detail.nivel || e.detail.nivel === this.currentNivel) {
          this.renderSubjects();
        }
      });
    }

    populateNivelSelects() {
      const courses = db.getCourses();

      if (this.nivelSelect) {
        if (courses.length === 0) {
          this.nivelSelect.innerHTML = '<option value="">(No hay cursos creados)</option>';
        } else {
          this.nivelSelect.innerHTML = courses.map(c => 
            `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</option>`
          ).join('');

          if (this.currentNivel && courses.some(c => c.nombre === this.currentNivel)) {
            this.nivelSelect.value = this.currentNivel;
          } else if (courses.length > 0) {
            this.nivelSelect.selectedIndex = 0;
            this.currentNivel = this.nivelSelect.value;
          }
        }
      }

      if (this.copyFromSelect) {
        if (courses.length === 0) {
          this.copyFromSelect.innerHTML = '<option value="">(No hay cursos creados)</option>';
        } else {
          this.copyFromSelect.innerHTML = courses.map(c => 
            `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</option>`
          ).join('');
        }
      }
    }

    initEvents() {
      // 1. Crear nuevo curso
      if (this.courseForm) {
        this.courseForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleCreateCourse();
        });
      }

      // Cargar catálogo estándar oficial
      if (this.btnLoadOfficialCatalog) {
        this.btnLoadOfficialCatalog.addEventListener('click', () => {
          if (confirm('¿Desea cargar el catálogo oficial completo de niveles chilenos (Transición a 4° Medio y Laboral)?\nLos cursos que ya existan se conservarán.')) {
            const total = db.loadOfficialCoursesCatalog();
            window.showToast(`Catálogo oficial cargado. Total de cursos: ${total}`, 'success');
          }
        });
      }

      // 2. Cambio de curso en el desplegable de asignaturas
      if (this.nivelSelect) {
        this.nivelSelect.addEventListener('change', (e) => {
          this.currentNivel = e.target.value;
          this.renderSubjects();
        });
      }

      // 3. Crear nueva asignatura para el curso seleccionado
      if (this.subjectForm) {
        this.subjectForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.handleAddSubject();
        });
      }

      // Detección inteligente al tipear el nombre de la asignatura (ej: Orientación, Religión)
      if (this.subjectNameInput) {
        this.subjectNameInput.addEventListener('input', (e) => {
          const val = e.target.value.trim();
          if (isTypicallyConceptual(val)) {
            if (this.conceptualCheckbox) this.conceptualCheckbox.checked = true;
            if (this.incideCheckbox) this.incideCheckbox.checked = false; // Religión y Orientación usualmente no inciden
          }
        });
      }

      // Copiar asignaturas desde otro curso
      if (this.btnCopySubjects) {
        this.btnCopySubjects.addEventListener('click', () => {
          this.handleCopySubjects();
        });
      }
    }

    handleCreateCourse() {
      const nombre = this.courseNameInput ? this.courseNameInput.value.trim() : '';
      const profesorJefe = this.courseProfesorInput ? this.courseProfesorInput.value.trim() : '';

      if (!nombre) {
        window.showToast('Por favor ingrese el nombre del curso', 'warning');
        return;
      }

      const created = db.saveCourse({ nombre, profesorJefe });
      if (created) {
        if (this.courseNameInput) this.courseNameInput.value = '';
        if (this.courseProfesorInput) this.courseProfesorInput.value = '';
        this.currentNivel = created.nombre;
        if (this.nivelSelect) this.nivelSelect.value = created.nombre;
        window.showToast(`Curso "${created.nombre}" creado exitosamente`, 'success');
      }
    }

    renderCoursesTable() {
      if (!this.coursesTableBody) return;

      const courses = db.getCourses();
      if (this.coursesTotalBadge) {
        this.coursesTotalBadge.textContent = `${courses.length} cursos registrados`;
      }

      if (courses.length === 0) {
        this.coursesTableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 2rem; color: #64748b;">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">🏫</div>
              <strong>No hay cursos registrados</strong>
              <p style="font-size: 0.85rem; margin-top: 0.25rem;">Cree el primer curso con el formulario superior o cargue el catálogo oficial.</p>
            </td>
          </tr>
        `;
        return;
      }

      this.coursesTableBody.innerHTML = courses.map((c, idx) => {
        const subjectsCount = db.getSubjectsForCourse(c.nombre).length;
        const studentsCount = db.getStudents(c.nombre).length;
        const pjDisplay = c.profesorJefe && c.profesorJefe.trim() ? c.profesorJefe.trim() : '<em style="color: #94a3b8;">Sin profesor asignado</em>';

        return `
          <tr>
            <td style="text-align: center; color: #64748b; font-weight: 600; width: 40px;">${idx + 1}</td>
            <td style="width: 250px;">
              <strong style="color: #1e3a8a; font-size: 0.95rem;">${escapeHtml(c.nombre)}</strong>
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 1.1rem;">👨‍🏫</span>
                <span style="font-weight: 500; color: #1e293b;">${pjDisplay}</span>
              </div>
            </td>
            <td style="text-align: center; width: 140px;">
              <span class="header-badge-tag" style="background: #e0e7ff; color: #3730a3; font-size: 0.8rem;">
                📚 ${subjectsCount} asignaturas
              </span>
            </td>
            <td style="text-align: center; width: 140px;">
              <span class="header-badge-tag" style="background: #ecfdf5; color: #065f46; font-size: 0.8rem;">
                👥 ${studentsCount} alumnos
              </span>
            </td>
            <td style="text-align: center; width: 160px;">
              <div style="display: flex; gap: 0.4rem; justify-content: center;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.subjectsView.editCourse('${c.id}')" title="Editar curso o profesor jefe">
                  ✏️ Editar
                </button>
                <button type="button" class="btn btn-danger btn-sm" onclick="window.subjectsView.deleteCourse('${c.id}', '${escapeHtml(c.nombre)}')" title="Eliminar curso">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    editCourse(courseId) {
      const course = db.getCourseById(courseId);
      if (!course) return;

      const nuevoNombre = prompt('Modificar nombre del curso:', course.nombre);
      if (nuevoNombre === null) return;
      const cleanNombre = nuevoNombre.trim();
      if (!cleanNombre) {
        window.showToast('El nombre no puede estar vacío', 'warning');
        return;
      }

      const nuevoPj = prompt(`Asignar Profesor(a) Jefe titular para "${cleanNombre}":`, course.profesorJefe || '');
      if (nuevoPj === null) return;

      db.saveCourse({
        id: course.id,
        nombre: cleanNombre,
        profesorJefe: nuevoPj.trim()
      });

      window.showToast(`Curso "${cleanNombre}" actualizado correctamente`, 'success');
    }

    deleteCourse(courseId, courseName) {
      const studentsCount = db.getStudents(courseName).length;
      let msg = `¿Está seguro de eliminar el curso "${courseName}"?`;
      if (studentsCount > 0) {
        msg += `\n\nATENCIÓN: Este curso tiene ${studentsCount} estudiante(s) matriculado(s).`;
      }

      if (confirm(msg)) {
        db.deleteCourse(courseId);
        window.showToast(`Curso "${courseName}" eliminado`, 'info');
      }
    }

    renderSubjects() {
      if (!this.listContainer) return;

      // Actualizar badge del profesor jefe asignado al curso seleccionado
      const currentCourse = db.getCourseByName(this.currentNivel);
      if (this.courseCurrentPjBadge) {
        if (currentCourse && currentCourse.profesorJefe) {
          this.courseCurrentPjBadge.innerHTML = `👨‍🏫 Profesor(a) Jefe: <strong>${escapeHtml(currentCourse.profesorJefe)}</strong>`;
          this.courseCurrentPjBadge.style.display = 'inline-block';
        } else {
          this.courseCurrentPjBadge.innerHTML = `👨‍🏫 Profesor(a) Jefe: <em style="color: #64748b;">No asignado</em>`;
          this.courseCurrentPjBadge.style.display = 'inline-block';
        }
      }

      if (!this.currentNivel) {
        this.listContainer.innerHTML = `
          <div style="text-align: center; padding: 2.5rem; color: #64748b; background: #f8fafc; border-radius: var(--radius-sm);">
            <strong>Seleccione o cree un curso para ver y agregar sus asignaturas</strong>
          </div>
        `;
        if (this.countBadge) this.countBadge.textContent = '0 asignaturas';
        return;
      }

      const subjects = db.getSubjectsForCourse(this.currentNivel);

      if (this.countBadge) {
        this.countBadge.textContent = `${subjects.length} asignaturas configuradas`;
      }

      if (subjects.length === 0) {
        this.listContainer.innerHTML = `
          <div style="text-align: center; padding: 2.5rem; color: #64748b; background: #f8fafc; border-radius: var(--radius-sm); border: 1.5px dashed #cbd5e1;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📝</div>
            <strong style="color: #1e3a8a; font-size: 1.05rem;">No hay asignaturas registradas para "${escapeHtml(this.currentNivel)}"</strong>
            <p style="font-size: 0.85rem; margin-top: 0.35rem;">Escriba el nombre de las asignaturas en el formulario superior para crear el plan de estudios.</p>
          </div>
        `;
        return;
      }

      const itemsHtml = subjects.map((sub, idx) => {
        const noIncide = sub.incideEnPromedio === false;
        const conceptual = sub.esConceptual;

        const incideBadge = noIncide
          ? `<span class="header-badge-tag" style="background: #fef3c7; color: #92400e; font-weight: 700;">⚠️ * No Incide en Promedio</span>`
          : `<span class="header-badge-tag" style="background: #ecfdf5; color: #065f46; font-weight: 600;">✓ Incide en Promedio</span>`;

        const conceptBadge = conceptual
          ? `<span class="header-badge-tag" style="background: #f3e8ff; color: #6b21a8; font-weight: 700;">✨ Escala Conceptual (I, S, B, MB)</span>`
          : `<span class="header-badge-tag" style="background: #eff6ff; color: #1e40af; font-weight: 600;">🔢 Escala Numérica (1.0 - 7.0)</span>`;

        const displayName = noIncide ? `${sub.nombre} *` : sub.nombre;

        return `
          <div class="card" style="margin-bottom: 0.6rem; padding: 0.8rem 1.1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-left: 4px solid ${noIncide ? '#f59e0b' : '#3b82f6'};">
            <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1;">
              <div style="font-weight: 700; color: #64748b; width: 28px; text-align: center;">${idx + 1}</div>
              <div>
                <div style="font-size: 1.02rem; font-weight: 700; color: #0f172a;">
                  ${escapeHtml(displayName)}
                </div>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.3rem; flex-wrap: wrap;">
                  ${incideBadge}
                  ${conceptBadge}
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 0.4rem;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.subjectsView.moveSubject('${sub.id}', -1)" ${idx === 0 ? 'disabled' : ''} title="Subir posición">
                ⬆️
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.subjectsView.moveSubject('${sub.id}', 1)" ${idx === subjects.length - 1 ? 'disabled' : ''} title="Bajar posición">
                ⬇️
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.subjectsView.toggleIncide('${sub.id}')" title="Alternar si incide o no en el promedio (*)">
                ${noIncide ? '✅ Hacer Incidir' : '⚠️ No Incidir (*)'}
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.subjectsView.toggleConceptual('${sub.id}')" title="Alternar escala conceptual (I, S, B, MB)">
                ${conceptual ? '🔢 Usar Números' : '✨ Usar Conceptos'}
              </button>
              <button type="button" class="btn btn-danger btn-sm" onclick="window.subjectsView.deleteSubject('${sub.id}', '${escapeHtml(sub.nombre)}')" title="Eliminar asignatura">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');

      this.listContainer.innerHTML = itemsHtml;
    }

    handleAddSubject() {
      if (!this.currentNivel) {
        window.showToast('Primero cree o seleccione un curso en el desplegable', 'warning');
        return;
      }

      const name = this.subjectNameInput ? this.subjectNameInput.value.trim() : '';
      if (!name) {
        window.showToast('Escriba el nombre de la asignatura', 'warning');
        return;
      }

      const incide = this.incideCheckbox ? this.incideCheckbox.checked : true;
      const conceptual = this.conceptualCheckbox ? this.conceptualCheckbox.checked : false;

      db.saveSubjectForCourse(this.currentNivel, {
        nombre: name,
        incideEnPromedio: incide,
        esConceptual: conceptual
      });

      if (this.subjectNameInput) this.subjectNameInput.value = '';
      if (this.incideCheckbox) this.incideCheckbox.checked = true;
      if (this.conceptualCheckbox) this.conceptualCheckbox.checked = false;

      window.showToast(`Asignatura "${name}" agregada a ${this.currentNivel}`, 'success');
      this.renderSubjects();
    }

    toggleIncide(subjectId) {
      const subjects = db.getSubjectsForCourse(this.currentNivel);
      const sub = subjects.find(s => s.id === subjectId);
      if (!sub) return;

      sub.incideEnPromedio = !sub.incideEnPromedio;
      db.saveSubjectForCourse(this.currentNivel, sub);
      window.showToast(`Asignatura "${sub.nombre}": ${sub.incideEnPromedio ? 'Ahora incide en el promedio' : 'Ahora NO incide (*)'}`, 'info');
      this.renderSubjects();
    }

    toggleConceptual(subjectId) {
      const subjects = db.getSubjectsForCourse(this.currentNivel);
      const sub = subjects.find(s => s.id === subjectId);
      if (!sub) return;

      sub.esConceptual = !sub.esConceptual;
      db.saveSubjectForCourse(this.currentNivel, sub);
      window.showToast(`Asignatura "${sub.nombre}": ${sub.esConceptual ? 'Evaluación por Conceptos (I, S, B, MB)' : 'Evaluación Numérica (1.0 - 7.0)'}`, 'info');
      this.renderSubjects();
    }

    moveSubject(subjectId, direction) {
      const subjects = db.getSubjectsForCourse(this.currentNivel);
      const idx = subjects.findIndex(s => s.id === subjectId);
      if (idx === -1) return;

      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= subjects.length) return;

      const temp = subjects[idx];
      subjects[idx] = subjects[targetIdx];
      subjects[targetIdx] = temp;

      const orderedIds = subjects.map(s => s.id);
      db.reorderCourseSubjects(this.currentNivel, orderedIds);
      this.renderSubjects();
    }

    deleteSubject(subjectId, subjectName) {
      if (confirm(`¿Desea eliminar la asignatura "${subjectName}" de ${this.currentNivel}?`)) {
        db.deleteSubjectForCourse(this.currentNivel, subjectId);
        window.showToast(`Asignatura "${subjectName}" eliminada de ${this.currentNivel}`, 'info');
        this.renderSubjects();
      }
    }

    handleCopySubjects() {
      const fromNivel = this.copyFromSelect ? this.copyFromSelect.value : null;
      if (!fromNivel) {
        window.showToast('Seleccione el curso de origen', 'warning');
        return;
      }

      if (fromNivel === this.currentNivel) {
        window.showToast('El curso de origen y el curso de destino deben ser diferentes', 'warning');
        return;
      }

      const sourceSubjects = db.getSubjectsForCourse(fromNivel);
      if (sourceSubjects.length === 0) {
        window.showToast(`El curso "${fromNivel}" no tiene asignaturas para copiar`, 'warning');
        return;
      }

      if (confirm(`¿Desea copiar las ${sourceSubjects.length} asignaturas de "${fromNivel}" a "${this.currentNivel}"?`)) {
        const copied = db.copySubjectsBetweenCourses(fromNivel, this.currentNivel);
        window.showToast(`Se copiaron ${copied.length} asignaturas a "${this.currentNivel}" exitosamente`, 'success');
        this.renderSubjects();
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

  return SubjectsView;
});
