import React from "react";
import { institutionalData } from "@/data/mockData";
import { StudentConsolidatedClient } from "./StudentConsolidatedClient";

interface StudentConsolidatedPageProps {
  params: Promise<{
    id: string;
    studentId: string;
  }>;
}

export default async function StudentConsolidatedPage({
  params,
}: StudentConsolidatedPageProps) {
  const { id, studentId } = await params;

  return (
    <StudentConsolidatedClient
      courseId={id}
      studentId={studentId}
      institution={institutionalData}
    />
  );
}

