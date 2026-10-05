"use client";

import React from "react";
import Link from "next/link";

export interface CourseCardData {
  id: string | number;
  nombre?: string;
  fullTitle?: string;
  nivel?: string;
  level?: string;
  letra?: string;
  section?: string;
  anio?: number;
  schoolYear?: number;
  headTeacher?: string;
  studentCount?: number;
  subjectCount?: number;
}

interface CourseCardProps {
  course: CourseCardData;
}

export function CourseCard({ course }: CourseCardProps) {
  const title = course.nombre || course.fullTitle || "Curso";
  const level = course.nivel || course.level || "Educación Regular";
  const letter = course.letra || course.section || (title.match(/\b([A-Za-z])\b$/)?.[1] ?? "");
  const grade = (title.match(/^[0-9]+[°º]/)?.[0]) || (title.split(" ")[0] ?? "");
  const headTeacher = course.headTeacher || "Sin asignar";
  const year = course.anio || course.schoolYear || 2026;

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-blue-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden">
      {/* Encabezado de la tarjeta */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200 mb-2">
              <span>{level}</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Profesor(a) Jefe:{" "}
              <span className="font-medium text-slate-700">{headTeacher}</span>
            </p>
          </div>

          <div className="w-12 h-12 rounded-xl bg-blue-900 text-white flex flex-col items-center justify-center font-bold text-sm shadow-xs shrink-0">
            <span className="text-xs uppercase font-semibold text-blue-200">
              {grade || "CURSO"}
            </span>
            <span className="text-base font-extrabold leading-none">
              {letter || "•"}
            </span>
          </div>
        </div>

        {/* Resumen institucional dinámico */}
        <div className="mt-5 flex items-center justify-between text-xs text-slate-500 bg-slate-50 px-3.5 py-2.5 rounded-lg border border-slate-200/60">
          <span>
            Año lectivo: <strong className="text-slate-700">{year}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Activo
          </span>
        </div>
      </div>

      {/* Pie de tarjeta con el botón funcional "Ver curso" usando ID dinámico */}
      <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">
          Régimen Semestral
        </span>

        <Link
          href={`/cursos/${course.id}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold tracking-wide transition-colors shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2"
        >
          <span>Ver curso</span>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
