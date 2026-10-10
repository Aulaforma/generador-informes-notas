import React from "react";
import { institutionalData } from "@/data/mockData";
import { ConfiguracionClient } from "./ConfiguracionClient";

export const metadata = {
  title: "Configuración Institucional | Sistema Escolar",
};

export default function ConfiguracionPage() {
  return <ConfiguracionClient institution={institutionalData} />;
}
