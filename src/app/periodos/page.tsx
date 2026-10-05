import React from "react";
import { institutionalData } from "@/data/mockData";
import { PeriodosClient } from "./PeriodosClient";

export const metadata = {
  title: "Administración de Períodos Académicos | Sistema Escolar",
};

export default function PeriodosPage() {
  return <PeriodosClient institution={institutionalData} />;
}
