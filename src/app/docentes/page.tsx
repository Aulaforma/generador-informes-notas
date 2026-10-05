import React from "react";
import { institutionalData } from "@/data/mockData";
import { DocentesClient } from "./DocentesClient";

export const metadata = {
  title: "Padrón de Docentes | Sistema Escolar",
};

export default function DocentesPage() {
  return <DocentesClient institution={institutionalData} />;
}
