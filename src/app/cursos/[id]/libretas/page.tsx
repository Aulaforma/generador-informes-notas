import React from "react";
import { institutionalData } from "@/data/mockData";
import { CourseReportCardsClient } from "./CourseReportCardsClient";

interface CourseReportCardsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CourseReportCardsPage({
  params,
}: CourseReportCardsPageProps) {
  const { id } = await params;

  return (
    <CourseReportCardsClient
      courseId={id}
      institution={institutionalData}
    />
  );
}
