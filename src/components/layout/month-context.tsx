"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type MonthContextValue = {
  year: number;
  month: number;
  monthIndex: number;
  label: string;
  setMonthIndex: (index: number) => void;
  setYear: (year: number) => void;
  monthNames: string[];
  years: number[];
};

const MonthContext = createContext<MonthContextValue | null>(null);

export function MonthProvider({ children }: { children: ReactNode }) {
  const [monthIndex, setMonthIndex] = useState(10); // novembro
  const [year, setYear] = useState(2026);

  const value = useMemo<MonthContextValue>(
    () => ({
      year,
      month: monthIndex + 1,
      monthIndex,
      label: `${MONTHS[monthIndex]} de ${year}`,
      setMonthIndex,
      setYear,
      monthNames: MONTHS,
      years: [2025, 2026, 2027],
    }),
    [monthIndex, year],
  );

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth() {
  const ctx = useContext(MonthContext);
  if (!ctx) throw new Error("useMonth precisa estar dentro de <MonthProvider>");
  return ctx;
}
