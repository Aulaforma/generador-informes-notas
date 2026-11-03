import React from "react";
import { institutionalData } from "@/data/mockData";
import { PdfGradeImportClient } from "./PdfGradeImportClient";

export const metadata = {
  title: "Importar Notas PDF | Libreta de Notas",
  description: "Herramienta administrativa UTP para importar calificaciones históricas desde informes escolares en PDF",
};

export default function ImportarNotasPdfPage() {
  return <PdfGradeImportClient institution={institutionalData} />;
}
