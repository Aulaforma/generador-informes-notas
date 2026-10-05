import React from "react";
import { institutionalData } from "@/data/mockData";
import { AsignaturasClient } from "./AsignaturasClient";

export const metadata = {
  title: "Catálogo de Asignaturas | Sistema Escolar",
};

export default function AsignaturasPage() {
  return <AsignaturasClient institution={institutionalData} />;
}
