import React from "react";
import { institutionalData } from "@/data/mockData";
import { StudentReportCardClient } from "./StudentReportCardClient";

interface StudentReportCardPageProps {
  params: Promise<{
    id: string;
    studentId: string;
  }>;
}

export default async function StudentReportCardPage({
  params,
}: StudentReportCardPageProps) {
  const { id, studentId } = await params;

  return (
    <StudentReportCardClient
      courseId={id}
      studentId={studentId}
      institution={institutionalData}
    />
  );
}
