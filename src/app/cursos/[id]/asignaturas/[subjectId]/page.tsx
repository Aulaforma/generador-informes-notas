import React from "react";
import { institutionalData, sampleCourses } from "@/data/mockData";
import { GradeEntryClient } from "./GradeEntryClient";

interface GradeEntryPageProps {
  params: Promise<{
    id: string;
    subjectId: string;
  }>;
}

export default async function GradeEntryPage({ params }: GradeEntryPageProps) {
  const { id, subjectId } = await params;

  // Datos mock opcionales para inicializar estructura visual mientras carga Supabase
  const mockCourse = sampleCourses.find((c) => c.id === id);
  const mockSubject = mockCourse?.subjects.find((s) => s.id === subjectId);

  return (
    <GradeEntryClient
      courseId={id}
      subjectId={subjectId}
      course={mockCourse}
      subject={mockSubject}
      institution={institutionalData}
    />
  );
}
