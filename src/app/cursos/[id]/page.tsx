import React from "react";
import { institutionalData } from "@/data/mockData";
import { CourseViewClient } from "./CourseViewClient";

interface CoursePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function CourseDetailPage({ params }: CoursePageProps) {
  const { id } = await params;

  return (
    <CourseViewClient
      courseId={id}
      institution={institutionalData}
    />
  );
}
