/**
 * VISTA DE MONITOREO DOCENTE PARA EL ADMINISTRADOR (js/monitoringView.js)
 * Permite supervisar qué profesores se han registrado, el avance en el ingreso de notas
 * por curso y asignatura, y el historial de actividad.
 */

(function(global) {
  'use strict';

  class MonitoringView {
    constructor() {
      this.container = null;
      this.filterCurso = 'TODOS';
      this.filterSemestre = '1';
    }

    init() {
      this.container = document.getElementById('monitoring-view');
      if (!this.container) return;

      this.render();
      this.bindEvents();

      window.addEventListener('auth_state_changed', () => {
        if (window.authManager?.isAdmin()) {
          this.render();
        }
      });

      window.addEventListener('cloud-data-updated', () => {
        if (this.container && this.container.classList.contains('active')) {
          this.render();
        }
      });
    }

    bindEvents() {
      if (!this.container) return;

      this.container.addEventListener('change', (e) => {
        if (e.target.id === 'monitoring-filter-course') {
          this.filterCurso = e.target.value;
          this.renderGradesProgressTable();
        } else if (e.target.id === 'monitoring-filter-semester') {
          this.filterSemestre = e.target.value;
          this.renderGradesProgressTable();
        }
      });

      this.container.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-delete-teacher');
        if (deleteBtn) {
          const userId = deleteBtn.dataset.userId;
          const userEmail = deleteBtn.dataset.userEmail;
          if (confirm(`¿Estás seguro de eliminar la cuenta del docente "${userEmail}"?`)) {
            try {
              window.authManager.deleteTeacher(userId);
              window.showToast('Cuenta de docente eliminada.', 'info');
              this.render();
            } catch (err) {
              window.showToast(err.message, 'danger');
            }
          }
        }
      });
    }

    render() {
      if (!this.container) return;

      if (!window.authManager?.isAdmin()) {
        this.container.innerHTML = `
          <div class="card" style="text-align: center; padding: 3rem 1.5rem;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
            <h2 style="color: #1e3a8a; margin-bottom: 0.5rem;">Acceso Reservado al Administrador</h2>
            <p style="color: #64748b; max-width: 500px; margin: 0 auto 1.5rem; line-height: 1.5;">
              El Panel de Monitoreo Docente solo está disponible para el Administrador Maestro del establecimiento.
            </p>
            <button class="btn btn-primary" id="btn-unlock-monitoring" onclick="document.getElementById('btn-role-badge')?.click();">
              🔑 Ingresar Clave Maestra de Administrador
            </button>
          </div>
        `;
        return;
      }

      const users = window.authManager.getUsers();
      const courses = window.db ? window.db.getCourses() : [];
      const totalStudents = window.db ? window.db.getStudents().length : 0;
      const activityLogs = window.authManager.getActivityLogs();

      // Métricas clave
      let totalGradesRecorded = 0;
      if (window.db) {
        totalGradesRecorded = window.db.getAllGrades().filter(g => (g.notes || []).some(n => n !== null && n !== '')).length;
      }

      this.container.innerHTML = `
        <!-- ENCABEZADO DE MONITOREO -->
        <div class="card no-print" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, #1e3a8a, #0f172a); color: #ffffff;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h2 style="margin: 0; font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>📊</span> Panel de Monitoreo y Supervisión Docente
              </h2>
              <p style="margin: 0.35rem 0 0; font-size: 0.88rem; color: #93c5fd;">
                Supervisa las cuentas de profesores, avance de calificaciones ingresadas y registros de auditoría en tiempo real.
              </p>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm" id="btn-refresh-monitoring" onclick="window.monitoringView.render()" style="background: rgba(255,255,255,0.15); color: #ffffff; border: 1px solid rgba(255,255,255,0.3); font-weight: 700;">
                🔄 Actualizar
              </button>
            </div>
          </div>

          <!-- TARJETAS DE INDICADORES (KPIs) -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem;">
            <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 1rem;">
              <span style="font-size: 0.78rem; color: #cbd5e1; text-transform: uppercase; font-weight: 700;">👨‍🏫 Docentes Registrados</span>
              <div style="font-size: 1.8rem; font-weight: 800; color: #38bdf8; margin-top: 0.25rem;">
                ${users.length}
              </div>
              <small style="color: #94a3b8; font-size: 0.75rem;">Con acceso activo al sistema</small>
            </div>

            <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 1rem;">
              <span style="font-size: 0.78rem; color: #cbd5e1; text-transform: uppercase; font-weight: 700;">🏫 Cursos Configurados</span>
              <div style="font-size: 1.8rem; font-weight: 800; color: #a7f3d0; margin-top: 0.25rem;">
                ${courses.length}
              </div>
              <small style="color: #94a3b8; font-size: 0.75rem;">${totalStudents} estudiantes matriculados</small>
            </div>

            <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 1rem;">
              <span style="font-size: 0.78rem; color: #cbd5e1; text-transform: uppercase; font-weight: 700;">📝 Calificaciones Ingresadas</span>
              <div style="font-size: 1.8rem; font-weight: 800; color: #fde047; margin-top: 0.25rem;">
                ${totalGradesRecorded}
              </div>
              <small style="color: #94a3b8; font-size: 0.75rem;">Registros con notas activas</small>
            </div>
          </div>
        </div>

        <!-- SECCIÓN 1: AVANCE DE INGRESO DE NOTAS POR ASIGNATURA Y CURSO -->
        <div class="card no-print" style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.2rem;">
            <div>
              <h3 style="margin: 0; color: #0f172a; font-size: 1.15rem;">📈 Estado de Avance de Calificaciones</h3>
              <p style="margin: 0.2rem 0 0; font-size: 0.8rem; color: #64748b;">
                Verifica qué asignaturas tienen sus notas completas y quién realizó el último ingreso.
              </p>
            </div>

            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <select id="monitoring-filter-course" class="form-control" style="font-size: 0.85rem; width: auto;">
                <option value="TODOS">Todos los Cursos</option>
                ${courses.map(c => `<option value="${c.id}" ${this.filterCurso === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
              </select>

              <select id="monitoring-filter-semester" class="form-control" style="font-size: 0.85rem; width: auto;">
                <option value="1" ${this.filterSemestre === '1' ? 'selected' : ''}>1° Semestre</option>
                <option value="2" ${this.filterSemestre === '2' ? 'selected' : ''}>2° Semestre</option>
              </select>
            </div>
          </div>

          <div id="monitoring-progress-table-container" style="overflow-x: auto;">
            <!-- Renderizado dinámico -->
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem;">
          <!-- SECCIÓN 2: DIRECTORIO DE PROFESORES REGISTRADOS -->
          <div class="card no-print">
            <h3 style="margin: 0 0 0.5rem; color: #0f172a; font-size: 1.1rem; display: flex; align-items: center; gap: 0.4rem;">
              <span>👨‍🏫</span> Directorio de Profesores Registrados
            </h3>
            <p style="margin: 0 0 1rem; font-size: 0.8rem; color: #64748b;">
              Docentes que han creado cuenta con su correo para ingresar notas y asistencia.
            </p>

            ${users.length === 0 ? `
              <div style="text-align: center; padding: 2rem 1rem; color: #94a3b8; background: #f8fafc; border-radius: 8px;">
                <span style="font-size: 2rem;">📭</span>
                <p style="margin-top: 0.5rem; font-size: 0.88rem;">Aún no hay profesores registrados.</p>
                <small>Comparte el Enlace Docente para que tus colegas creen su cuenta.</small>
              </div>
            ` : `
              <div style="overflow-x: auto;">
                <table class="table" style="font-size: 0.82rem;">
                  <thead>
                    <tr style="background: #f1f5f9;">
                      <th>Profesor(a)</th>
                      <th>Asignatura</th>
                      <th>Último Acceso</th>
                      <th style="text-align: center;">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${users.map(u => `
                      <tr>
                        <td>
                          <strong>${u.nombre}</strong><br/>
                          <small style="color: #64748b;">${u.email}</small>
                        </td>
                        <td><span class="badge" style="background: #e0f2fe; color: #0369a1;">${u.asignatura || 'General'}</span></td>
                        <td><small style="color: #64748b;">${u.lastLogin ? new Date(u.lastLogin).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Sin registros'}</small></td>
                        <td style="text-align: center;">
                          <button class="btn btn-danger btn-sm btn-delete-teacher" data-user-id="${u.id}" data-user-email="${u.email}" title="Eliminar cuenta" style="padding: 2px 6px; font-size: 0.72rem;">
                            🗑️
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <!-- SECCIÓN 3: REGISTRO DE AUDITORÍA Y ACTIVIDAD RECIENTE -->
          <div class="card no-print">
            <h3 style="margin: 0 0 0.5rem; color: #0f172a; font-size: 1.1rem; display: flex; align-items: center; gap: 0.4rem;">
              <span>🕒</span> Auditoría de Actividad Reciente
            </h3>
            <p style="margin: 0 0 1rem; font-size: 0.8rem; color: #64748b;">
              Historial de ingresos, modificaciones de calificaciones y cambios en la plataforma.
            </p>

            <div style="max-height: 380px; overflow-y: auto; padding-right: 0.5rem;">
              ${activityLogs.length === 0 ? `
                <div style="text-align: center; padding: 2rem 1rem; color: #94a3b8; background: #f8fafc; border-radius: 8px;">
                  <p style="font-size: 0.88rem;">Sin registros de actividad recientes.</p>
                </div>
              ` : `
                <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                  ${activityLogs.map(log => `
                    <div style="padding: 0.6rem 0.75rem; background: #f8fafc; border-left: 3px solid #3b82f6; border-radius: 4px; font-size: 0.8rem;">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: #1e3a8a;">${log.action}</strong>
                        <small style="color: #94a3b8; font-size: 0.72rem;">
                          ${new Date(log.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </div>
                      <p style="margin: 0.25rem 0 0; color: #475569; line-height: 1.35;">${log.details}</p>
                      <small style="color: #64748b; font-size: 0.72rem; display: block; margin-top: 0.2rem;">
                        Por: ${log.userName} (${log.userEmail})
                      </small>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        </div>
      `;

      this.renderGradesProgressTable();
    }

    renderGradesProgressTable() {
      const container = document.getElementById('monitoring-progress-table-container');
      if (!container || !window.db) return;

      const courses = window.db.getCourses();
      const semester = parseInt(this.filterSemestre, 10) || 1;

      let filteredCourses = courses;
      if (this.filterCurso !== 'TODOS') {
        filteredCourses = courses.filter(c => c.id === this.filterCurso);
      }

      if (filteredCourses.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#94a3b8; padding: 2rem;">No hay cursos para mostrar.</p>`;
        return;
      }

      const rows = [];

      filteredCourses.forEach(course => {
        const queryNivel = course.nombre || course.nivel || '';
        const students = window.db.getStudents ? window.db.getStudents(queryNivel) : [];
        const subjects = window.db.getSubjectsForCourse ? window.db.getSubjectsForCourse(queryNivel) : [];

        subjects.forEach(subject => {
          let studentsWithGrades = 0;
          let totalFilledNotes = 0;
          let lastAuthor = 'Sin registros';
          let lastDate = null;

          students.forEach(st => {
            const gradeRec = window.db.getGradesForStudentAndSubject(st.id, subject.nombre, semester);
            if (gradeRec && Array.isArray(gradeRec.notes)) {
              const countFilled = gradeRec.notes.filter(n => n !== null && n !== '').length;
              if (countFilled > 0) {
                studentsWithGrades++;
                totalFilledNotes += countFilled;
                if (gradeRec.updatedBy) lastAuthor = gradeRec.updatedBy;
                if (gradeRec.updatedAt && (!lastDate || new Date(gradeRec.updatedAt) > new Date(lastDate))) {
                  lastDate = gradeRec.updatedAt;
                }
              }
            }
          });

          const percentStudents = students.length > 0 ? Math.round((studentsWithGrades / students.length) * 100) : 0;

          let statusBadge = '';
          if (percentStudents >= 85) {
            statusBadge = `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:700;">🟢 Al Día (${percentStudents}%)</span>`;
          } else if (percentStudents > 0) {
            statusBadge = `<span class="badge" style="background:#fef9c3; color:#854d0e; font-weight:700;">🟡 En Progreso (${percentStudents}%)</span>`;
          } else {
            statusBadge = `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:700;">🔴 Sin Notas (0%)</span>`;
          }

          rows.push({
            cursoNombre: course.nombre,
            asignaturaNombre: subject.nombre,
            totalStudents: students.length,
            studentsWithGrades,
            totalFilledNotes,
            percentStudents,
            statusBadge,
            lastAuthor,
            lastDate
          });
        });
      });

      if (rows.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#94a3b8; padding: 2rem;">No hay asignaturas asociadas a este curso.</p>`;
        return;
      }

      container.innerHTML = `
        <table class="table" style="font-size: 0.83rem; margin-bottom: 0;">
          <thead>
            <tr style="background: #f8fafc;">
              <th>Curso</th>
              <th>Asignatura</th>
              <th style="text-align: center;">Alumnos con Notas</th>
              <th style="text-align: center;">Estado</th>
              <th>Último Ingreso / Docente</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${r.cursoNombre}</strong></td>
                <td>${r.asignaturaNombre}</td>
                <td style="text-align: center;">
                  <strong>${r.studentsWithGrades}</strong> / ${r.totalStudents} estudiantes
                  <div style="background: #e2e8f0; height: 6px; border-radius: 3px; margin-top: 4px; overflow: hidden;">
                    <div style="width: ${r.percentStudents}%; height: 100%; background: ${r.percentStudents >= 85 ? '#10b981' : r.percentStudents > 0 ? '#f59e0b' : '#ef4444'};"></div>
                  </div>
                </td>
                <td style="text-align: center;">${r.statusBadge}</td>
                <td>
                  <small style="color: #1e293b; font-weight: 600;">${r.lastAuthor}</small><br/>
                  <small style="color: #94a3b8; font-size: 0.72rem;">${r.lastDate ? new Date(r.lastDate).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Pendiente'}</small>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  }

  global.monitoringView = new MonitoringView();

})(typeof self !== 'undefined' ? self : this);
