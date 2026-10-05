"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { initialGradesData, sampleSubjects } from "@/data/mockData";

export interface SubjectStoreData {
  evaluations: string[];
  grades: { [studentListNumber: number]: string[] };
}

export interface GradesStore {
  [subjectId: string]: SubjectStoreData;
}

interface GradesContextType {
  gradesStore: GradesStore;
  getSubjectData: (subjectId: string) => SubjectStoreData;
  saveSubjectData: (
    subjectId: string,
    grades: { [studentListNumber: number]: string[] },
    evaluations: string[]
  ) => void;
  resetToInitial: () => void;
}

const STORAGE_KEY = "libreta_notas_calificaciones_2026";

// Construir el estado inicial predeterminado a partir de los datos ficticios
const buildDefaultStore = (): GradesStore => {
  const store: GradesStore = {};
  sampleSubjects.forEach((subject) => {
    const evalCount = subject.evaluationsCount || 3;
    const evaluations = Array.from({ length: evalCount }, (_, i) => `Nota ${i + 1}`);
    const subjectGrades = initialGradesData[subject.id] || {};

    // Asegurarse de que cada estudiante tenga el largo adecuado
    const normalizedGrades: { [key: number]: string[] } = {};
    for (let listNumber = 1; listNumber <= 10; listNumber++) {
      const studentRow = subjectGrades[listNumber] ? [...subjectGrades[listNumber]] : [];
      while (studentRow.length < evalCount) {
        studentRow.push("");
      }
      normalizedGrades[listNumber] = studentRow;
    }

    store[subject.id] = {
      evaluations,
      grades: normalizedGrades,
    };
  });
  return store;
};

const GradesContext = createContext<GradesContextType | undefined>(undefined);

export function GradesProvider({ children }: { children: React.ReactNode }) {
  const [gradesStore, setGradesStore] = useState<GradesStore>(buildDefaultStore);
  const [isLoaded, setIsLoaded] = useState(false);

  // Cargar estado guardado de localStorage al iniciar en el cliente
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as GradesStore;
        setGradesStore(parsed);
      }
    } catch (e) {
      console.warn("No se pudo cargar desde localStorage, usando datos base:", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Guardar en localStorage cuando cambie el store (después de la carga inicial)
  const saveSubjectData = (
    subjectId: string,
    newGrades: { [studentListNumber: number]: string[] },
    newEvaluations: string[]
  ) => {
    setGradesStore((prev) => {
      const updated: GradesStore = {
        ...prev,
        [subjectId]: {
          evaluations: newEvaluations,
          grades: newGrades,
        },
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Error al persistir calificaciones en localStorage:", e);
      }

      return updated;
    });
  };

  const getSubjectData = (subjectId: string): SubjectStoreData => {
    if (gradesStore[subjectId]) {
      return gradesStore[subjectId];
    }
    const defaultStore = buildDefaultStore();
    return defaultStore[subjectId] || { evaluations: ["Nota 1", "Nota 2", "Nota 3"], grades: {} };
  };

  const resetToInitial = () => {
    const defaults = buildDefaultStore();
    setGradesStore(defaults);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  return (
    <GradesContext.Provider
      value={{
        gradesStore,
        getSubjectData,
        saveSubjectData,
        resetToInitial,
      }}
    >
      {children}
    </GradesContext.Provider>
  );
}

export function useGrades() {
  const context = useContext(GradesContext);
  if (!context) {
    throw new Error("useGrades debe utilizarse dentro de un GradesProvider");
  }
  return context;
}
