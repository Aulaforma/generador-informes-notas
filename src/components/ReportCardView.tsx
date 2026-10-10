import React from "react";
import { SubjectConsolidated } from "@/app/cursos/[id]/estudiantes/[studentId]/StudentConsolidatedClient";

export interface ReportCardViewProps {
  studentName: string;
  studentListNumber: number;
  courseName: string;
  headTeacherName?: string;
  schoolYear: number;
  schoolName?: string;
  city?: string;
  subjectRows: SubjectConsolidated[];
  generalAvgS1: string;
  generalAvgS2: string;
  generalAvgAnual: string;
  periodoNombre?: string;
  periodoNumero?: 1 | 2 | "anual";
  jefeUtpName?: string;
  directorName?: string;
}

/**
 * Componente visual de la Libreta Oficial de Notas del Estudiante.
 * 
 * - Si periodoNumero es 1 o 2: se formatea optimizado en formato CARTA VERTICAL (portrait),
 *   mostrando exclusivamente las evaluaciones y promedio del período correspondiente.
 * - Si periodoNumero es "anual" (o no especificado): se formatea en CARTA HORIZONTAL (landscape),
 *   mostrando ambos semestres (S1 y S2), promedios semestrales y promedio anual.
 */
export function ReportCardView({
  studentName,
  studentListNumber,
  courseName,
  headTeacherName,
  schoolYear,
  schoolName = "Liceo Andrés Alcázar de Tucapel",
  city = "Tucapel",
  subjectRows,
  generalAvgS1,
  generalAvgS2,
  generalAvgAnual,
  periodoNombre,
  periodoNumero = 1,
  jefeUtpName,
  directorName,
}: ReportCardViewProps) {
  const isSinglePeriod = periodoNumero === 1 || periodoNumero === 2;

  const currentPeriodLabel =
    periodoNombre ||
    (periodoNumero === 1
      ? "Primer Semestre"
      : periodoNumero === 2
      ? "Segundo Semestre"
      : "Resumen Anual");

  const hasNonContributingSubject = subjectRows.some(
    (s) => s.incidePromedio === false
  );

  const isHeadTeacherAssigned =
    Boolean(headTeacherName) &&
    headTeacherName?.trim() !== "" &&
    headTeacherName !== "Profesor(a) no asignado(a)" &&
    headTeacherName !== "Sin asignar" &&
    headTeacherName !== "Sin profesor(a) jefe asignado(a)";

  const cleanHeadTeacherName = isHeadTeacherAssigned ? headTeacherName?.trim() : null;
  const cleanJefeUtpName = jefeUtpName && jefeUtpName.trim() !== "" ? jefeUtpName.trim() : null;
  const cleanDirectorName = directorName && directorName.trim() !== "" ? directorName.trim() : null;

  return (
    <article
      className={`report-card-sheet bg-white text-slate-900 font-sans p-4 sm:p-6 mx-auto border border-slate-300 shadow-sm print:border-none print:shadow-none print:p-0 print:max-w-none ${
        isSinglePeriod ? "max-w-[840px]" : "max-w-[1120px]"
      }`}
    >
      {/* 1. ENCABEZADO INSTITUCIONAL OFICIAL */}
      <header className="flex items-center justify-between pb-2 border-b-2 border-slate-900 gap-3 avoid-break">
        <div className="shrink-0">
          <img
            src="/insignia-liceo.png"
            alt="Insignia Institucional"
            className="h-14 w-auto object-contain print:h-12"
          />
        </div>

        <div className="flex-1 text-center">
          <h1 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 leading-tight">
            {schoolName}
          </h1>
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
            {city}
          </p>
          <h2 className="text-xs sm:text-sm font-extrabold uppercase text-slate-900 tracking-wide mt-0.5 underline decoration-2 underline-offset-2">
            Libreta de Notas
          </h2>
          <p className="text-[10px] font-bold text-slate-800">
            Año Escolar {schoolYear} · <span className="text-blue-900 font-extrabold">{currentPeriodLabel}</span>
          </p>
        </div>

        <div className="shrink-0 w-14 hidden sm:block print:hidden" aria-hidden="true" />
      </header>

      {/* 2. FICHA DEL ESTUDIANTE */}
      <section className="my-2 p-2 bg-slate-50 border border-slate-300 rounded text-slate-900 avoid-break print:bg-white print:border-slate-400">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-y-1 gap-x-3 text-[11px] print:text-[9.5px]">
          <div className="col-span-2 sm:col-span-2">
            <span className="font-bold text-slate-600 uppercase text-[9px] block">
              Estudiante:
            </span>
            <span className="font-extrabold text-slate-900">
              {studentName}
            </span>
          </div>

          <div>
            <span className="font-bold text-slate-600 uppercase text-[9px] block">
              Curso:
            </span>
            <span className="font-bold text-slate-900">
              {courseName}
            </span>
          </div>

          <div>
            <span className="font-bold text-slate-600 uppercase text-[9px] block">
              N.º de Lista:
            </span>
            <span className="font-bold text-slate-900">
              {studentListNumber}
            </span>
          </div>

          <div>
            <span className="font-bold text-slate-600 uppercase text-[9px] block">
              Año Escolar:
            </span>
            <span className="font-bold text-slate-900">
              {schoolYear}
            </span>
          </div>

          <div>
            <span className="font-bold text-slate-600 uppercase text-[9px] block">
              Período:
            </span>
            <span className="font-bold text-slate-900">
              {currentPeriodLabel}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-6 border-t border-slate-200 mt-0.5 pt-0.5 flex flex-wrap items-center gap-1">
            <span className="font-bold text-slate-600 uppercase text-[9px]">
              Profesor(a) Jefe:
            </span>
            <span className="font-bold text-slate-900">
              {headTeacherName}
            </span>
          </div>
        </div>
      </section>

      {/* 3. TABLA DE ASIGNATURAS SEGÚN PERÍODO */}
      <section className="my-2">
        {isSinglePeriod ? (
          /* TABLA PARA PERÍODO INDIVIDUAL (Carta Vertical - 1° o 2° Semestre) */
          <table className="w-full border-collapse border border-slate-400 text-[10px] print:text-[8.5px]">
            <thead>
              <tr className="bg-slate-100 text-slate-900 border-b border-slate-400 font-bold uppercase text-[9px] print:text-[8px]">
                <th
                  rowSpan={2}
                  scope="col"
                  className="py-1 px-2 text-left border-r border-slate-300 w-[30%]"
                >
                  Asignatura
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="py-1 px-2 text-left border-r border-slate-300 w-[24%]"
                >
                  Docente
                </th>
                <th
                  colSpan={10}
                  scope="col"
                  className="py-0.5 px-1 text-center border-r border-slate-300 bg-slate-200/50 print:bg-slate-100"
                >
                  Evaluaciones Parciales — {currentPeriodLabel}
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="py-1 px-1.5 text-center w-[8%] bg-blue-50/70 print:bg-slate-200 font-extrabold"
                >
                  Promedio
                </th>
              </tr>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-400 font-bold text-[8px] print:text-[7.5px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <th
                    key={`p-h-${num}`}
                    scope="col"
                    className="py-0.5 text-center w-[3.8%] border-r border-slate-300"
                  >
                    N{num}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-300">
              {subjectRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-4 text-center text-slate-500 italic">
                    No hay asignaturas registradas para este curso.
                  </td>
                </tr>
              ) : (
                subjectRows.map((row) => {
                  const semDetail =
                    periodoNumero === 1 ? row.semestre1 : row.semestre2;

                  const grades = Array.from({ length: 10 }, (_, i) => {
                    const cell = semDetail.notas[i];
                    return cell && cell.display !== "-" ? cell.display : "—";
                  });

                  return (
                    <tr key={row.asignaturaId} className="avoid-break hover:bg-slate-50/50">
                      <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-300">
                        {row.asignaturaNombre}
                        {row.incidePromedio === false ? " (*)" : ""}
                      </td>
                      <td className="py-1 px-2 text-slate-700 border-r border-slate-300 text-[9px] print:text-[8px] truncate">
                        {row.docente}
                      </td>

                      {/* 10 Notas parciales del período */}
                      {grades.map((nota, i) => (
                        <td
                          key={`single-nota-${i}`}
                          className="py-1 px-0.5 text-center border-r border-slate-300 font-medium text-slate-800"
                        >
                          {nota}
                        </td>
                      ))}

                      {/* Promedio del período */}
                      <td className="py-1 px-1 text-center font-extrabold text-slate-950 bg-blue-50/30 print:bg-white text-[10px] print:text-[8.5px]">
                        {semDetail.promedioText}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          /* TABLA PARA RESUMEN ANUAL (Carta Horizontal - Ambos Semestres) */
          <table className="w-full border-collapse border border-slate-400 text-[10px] print:text-[8px]">
            <thead>
              <tr className="bg-slate-100 text-slate-900 border-b border-slate-400 font-bold uppercase text-[9px] print:text-[8px] print:bg-slate-100">
                <th
                  rowSpan={2}
                  scope="col"
                  className="py-1 px-2 text-left border-r border-slate-300 w-[18%]"
                >
                  Asignatura
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="py-1 px-2 text-left border-r border-slate-300 w-[14%]"
                >
                  Docente
                </th>
                <th
                  colSpan={10}
                  scope="col"
                  className="py-0.5 px-1 text-center border-r border-slate-300 bg-slate-200/50 print:bg-slate-200/50"
                >
                  1° Semestre
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="py-1 px-1 text-center w-[4.5%] border-r border-slate-400 bg-blue-50/60 print:bg-slate-100"
                >
                  Prom. S1
                </th>
                <th
                  colSpan={10}
                  scope="col"
                  className="py-0.5 px-1 text-center border-r border-slate-300 bg-slate-200/50 print:bg-slate-200/50"
                >
                  2° Semestre
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="py-1 px-1 text-center w-[4.5%] border-r border-slate-400 bg-blue-50/60 print:bg-slate-100"
                >
                  Prom. S2
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="py-1 px-1 text-center w-[5.5%] bg-slate-200/80 print:bg-slate-200"
                >
                  Prom. Anual
                </th>
              </tr>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-400 font-bold text-[8px] print:text-[7.5px]">
                {/* 10 columnas S1 */}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <th
                    key={`s1-h-${num}`}
                    scope="col"
                    className="py-0.5 text-center w-[2.2%] border-r border-slate-300"
                  >
                    {num}
                  </th>
                ))}
                {/* 10 columnas S2 */}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <th
                    key={`s2-h-${num}`}
                    scope="col"
                    className="py-0.5 text-center w-[2.2%] border-r border-slate-300"
                  >
                    {num}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-300">
              {subjectRows.length === 0 ? (
                <tr>
                  <td colSpan={25} className="py-4 text-center text-slate-500 italic">
                    No hay asignaturas registradas para este curso.
                  </td>
                </tr>
              ) : (
                subjectRows.map((row) => {
                  const s1Grades = Array.from({ length: 10 }, (_, i) => {
                    const cell = row.semestre1.notas[i];
                    return cell && cell.display !== "-" ? cell.display : "—";
                  });

                  const s2Grades = Array.from({ length: 10 }, (_, i) => {
                    const cell = row.semestre2.notas[i];
                    return cell && cell.display !== "-" ? cell.display : "—";
                  });

                  return (
                    <tr key={row.asignaturaId} className="avoid-break hover:bg-slate-50/50">
                      <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-300 truncate">
                        {row.asignaturaNombre}
                        {row.incidePromedio === false ? " (*)" : ""}
                      </td>
                      <td className="py-1 px-2 text-slate-700 border-r border-slate-300 text-[9px] print:text-[7.5px] truncate">
                        {row.docente}
                      </td>

                      {/* S1: 10 Notas Parciales */}
                      {s1Grades.map((nota, i) => (
                        <td
                          key={`s1-nota-${i}`}
                          className="py-1 px-0.5 text-center border-r border-slate-300 font-medium text-slate-800"
                        >
                          {nota}
                        </td>
                      ))}

                      {/* Promedio Semestre 1 */}
                      <td className="py-1 px-0.5 text-center border-r border-slate-400 font-extrabold text-slate-950 bg-blue-50/30 print:bg-white">
                        {row.semestre1.promedioText}
                      </td>

                      {/* S2: 10 Notas Parciales */}
                      {s2Grades.map((nota, i) => (
                        <td
                          key={`s2-nota-${i}`}
                          className="py-1 px-0.5 text-center border-r border-slate-300 font-medium text-slate-800"
                        >
                          {nota}
                        </td>
                      ))}

                      {/* Promedio Semestre 2 */}
                      <td className="py-1 px-0.5 text-center border-r border-slate-400 font-extrabold text-slate-950 bg-blue-50/30 print:bg-white">
                        {row.semestre2.promedioText}
                      </td>

                      {/* Promedio Anual */}
                      <td className="py-1 px-0.5 text-center font-black text-slate-950 bg-slate-100/50 print:bg-white">
                        {row.promedioAnualNum === null ? (
                          <span className="text-slate-400 font-normal">—</span>
                        ) : (
                          <div className="inline-flex items-center justify-center gap-0.5">
                            <span>{row.promedioAnualText}</span>
                            {row.esProvisional && (
                              <span
                                className="text-[7.5px] font-black uppercase text-amber-900 bg-amber-100 px-0.5 rounded border border-amber-300"
                                title="Promedio Provisional"
                              >
                                P
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* 4. CUADRO DE RESUMEN DE PROMEDIOS GENERALES */}
      <section className="avoid-break my-2 p-2 border border-slate-400 bg-slate-50 rounded print:bg-white">
        {isSinglePeriod ? (
          <div className="flex items-center justify-between px-3 py-0.5 text-xs">
            <span className="text-[10px] font-bold text-slate-700 uppercase">
              Promedio General {currentPeriodLabel}:
            </span>
            <span className="text-sm font-black text-slate-900 bg-white px-3 py-0.5 rounded border border-slate-300">
              {periodoNumero === 1 ? generalAvgS1 : generalAvgS2}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-3 text-center text-xs divide-x divide-slate-300">
            <div className="px-2">
              <span className="text-[9px] font-bold text-slate-600 uppercase block">
                Promedio General 1° Semestre
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                {generalAvgS1}
              </span>
            </div>

            <div className="px-2">
              <span className="text-[9px] font-bold text-slate-600 uppercase block">
                Promedio General 2° Semestre
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                {generalAvgS2}
              </span>
            </div>

            <div className="px-2">
              <span className="text-[9px] font-bold text-slate-600 uppercase block">
                Promedio General Anual
              </span>
              <span
                className={`text-xs sm:text-sm font-extrabold ${
                  generalAvgAnual === "En curso"
                    ? "text-amber-800 font-bold"
                    : "text-slate-900"
                }`}
              >
                {generalAvgAnual}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 5. OBSERVACIONES DEL PROFESOR JEFE (Para escritura manual institucional) */}
      <section className="avoid-break my-2 border border-slate-400 rounded p-2">
        <h3 className="text-[9px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
          Observaciones del Profesor(a) Jefe
        </h3>
        <div className="space-y-2.5 pt-0.5 pb-0.5">
          <div className="border-b border-dashed border-slate-300 h-2" />
          <div className="border-b border-dashed border-slate-300 h-2" />
        </div>
      </section>

      {/* 6. FIRMAS INSTITUCIONALES (En una sola fila horizontal) */}
      <footer className="avoid-break mt-3 pt-2">
        <div className="grid grid-cols-3 gap-8 text-center text-xs">
          <div>
            <div className="border-t border-slate-900 w-3/4 mx-auto pt-1 mb-0.5" />
            {cleanHeadTeacherName && (
              <span className="font-extrabold text-slate-900 block text-[9.5px] print:text-[8.5px] truncate leading-tight">
                {cleanHeadTeacherName}
              </span>
            )}
            <span className="font-bold text-slate-800 block text-[9px] print:text-[8px]">
              Profesor(a) Jefe
            </span>
            <span className="text-[8px] text-slate-500 block print:text-[7.5px]">
              Firma y Timbre
            </span>
          </div>

          <div>
            <div className="border-t border-slate-900 w-3/4 mx-auto pt-1 mb-0.5" />
            {cleanJefeUtpName && (
              <span className="font-extrabold text-slate-900 block text-[9.5px] print:text-[8.5px] truncate leading-tight">
                {cleanJefeUtpName}
              </span>
            )}
            <span className="font-bold text-slate-800 block text-[9px] print:text-[8px]">
              Jefe UTP
            </span>
            <span className="text-[8px] text-slate-500 block print:text-[7.5px]">
              Firma y Timbre
            </span>
          </div>

          <div>
            <div className="border-t border-slate-900 w-3/4 mx-auto pt-1 mb-0.5" />
            {cleanDirectorName && (
              <span className="font-extrabold text-slate-900 block text-[9.5px] print:text-[8.5px] truncate leading-tight">
                {cleanDirectorName}
              </span>
            )}
            <span className="font-bold text-slate-800 block text-[9px] print:text-[8px]">
              Director(a)
            </span>
            <span className="text-[8px] text-slate-500 block print:text-[7.5px]">
              Firma y Timbre
            </span>
          </div>
        </div>

        {hasNonContributingSubject && (
          <div className="text-left text-[8.5px] font-medium text-slate-600 mt-2 print:text-[7.5px]">
            (*) Asignatura que no incide en el promedio general.
          </div>
        )}

        <div className="text-center text-[8px] text-slate-400 mt-2 border-t border-slate-200 pt-1 print:text-slate-500">
          Documento Oficial de Calificaciones · {schoolName} · Generado el {new Date().toLocaleDateString("es-CL")}
        </div>
      </footer>
    </article>
  );
}
