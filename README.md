# Generador de Informes de Notas y Gestión Académica
### Liceo Andrés Alcázar de Tucapel

Sistema web para la gestión académica, registro de calificaciones con cuadrícula docente de 12 notas, control de asistencia escolar y generación de informes oficiales de notas en formato tamaño Carta (Letter) con restricción estricta de 1 página física por estudiante.

---

## 🚀 Características Principales

1. **Configuración Institucional (Membrete)**:
   - Nombre oficial del establecimiento: *Liceo Andrés Alcázar de Tucapel*.
   - RBD, Año Escolar, Comuna y Región.
   - Carga de insignia / logo en Base64 con inyección automática en el encabezado de los informes.

2. **Módulo de Registro de Estudiantes (Matrícula)**:
   - Registro de estudiantes con RUT numérico, Dígito Verificador (DV) con cálculo asistido, Nombres, Apellidos y Niveles oficiales (*Transición 1 hasta Cuarto Medio B y Curso Laboral*).
   - Ordenamiento alfabético automático por apellidos.

3. **Cuadrícula Docente de Calificaciones y Asistencia**:
   - Hasta 40 alumnos por curso.
   - 12 columnas editables de notas (`N1` a `N12`) con navegación rápida mediante teclado.
   - **Regla Oficial de Redondeo**: Aproximación a partir del segundo decimal (ej. $6,57 \to 6,6$; $6,44 \to 6,4$).
   - **Promedio General del Curso**: Cálculo dinámico en tiempo real para cada asignatura.
   - **Asistencia Escolar**: Días trabajados, días asistidos y cálculo automático del porcentaje (%) con alerta preventiva ante riesgo de repitencia (< 85%).

4. **Motor de Informes y Exportación PDF**:
   - Maquetado oficial calibrado para papel tamaño **Carta (Letter)** garantizando que cada estudiante ocupe **1 sola página física**.
   - Tabla comparativa de hasta 18 asignaturas con la nota final del alumno y el promedio general del curso.
   - Resumen académico y de asistencia al pie de la tabla.
   - Zona estática de firmas centradas (*Firma Profesor(a) Jefe* y *Firma Director*).
   - Exportación individual o en lote por nivel con saltos de página obligatorios (`page-break`).

---

## 💻 Ejecución Local

No requiere instalación de dependencias ni servidores complejos:
- En Windows: Hacer doble clic en `iniciar.bat` o abrir directamente `index.html` en Google Chrome, Microsoft Edge o cualquier navegador moderno.

---

## 🛠️ Tecnologías Utilizadas

- **HTML5 & Vanilla CSS**: Sistema de diseño moderno institucional y estilos `@media print` optimizados.
- **JavaScript (ES6 / UMD)**: Motor de cálculo reactivo, persistencia relacional en LocalStorage y exportación JSON.
- **html2pdf.js**: Generación directa de archivos PDF en el cliente.
