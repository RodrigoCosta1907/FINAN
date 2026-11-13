import { DashboardView } from "@/components/dashboard/dashboard-view";
import { ensureHousehold, requireUser } from "@/lib/auth";
import { getDashboardData } from "@/server/queries/dashboard";

export const instant = false;

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

export default async function VisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string }>;
}) {
  const { mes, ano } = await searchParams;

  // "hoje" no fuso do usuário, para não errar vencimento perto da meia-noite.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [todayYear, todayMonth] = today.split("-").map(Number);

  const month = clamp(Number(mes) || todayMonth || 1, 1, 12);
  const year = clamp(Number(ano) || todayYear || 2026, 2000, 2100);

  const user = await requireUser();
  const householdId = await ensureHousehold(user);
  const data = await getDashboardData(householdId, year, month);

  return (
    <DashboardView
      data={data}
      monthLabel={`${MONTH_NAMES[month - 1]} de ${year}`}
      today={today}
    />
  );
}
