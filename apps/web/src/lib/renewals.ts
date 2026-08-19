import type { RenewalBucket } from "@/data/ramos";

/** Días hasta vencimiento de póliza → bucket 90-60-30-7 o vencida. */
export function renewalBucket(daysUntilEnd: number): RenewalBucket | null {
  if (daysUntilEnd >= 61 && daysUntilEnd <= 90) return "90";
  if (daysUntilEnd >= 31 && daysUntilEnd <= 60) return "60";
  if (daysUntilEnd >= 8 && daysUntilEnd <= 30) return "30";
  if (daysUntilEnd >= 0 && daysUntilEnd <= 7) return "7";
  if (daysUntilEnd < 0) return "overdue";
  return null;
}

export const RENEWAL_BUCKET_LABEL: Record<RenewalBucket, string> = {
  "90": "90 días — diagnóstico",
  "60": "60 días — propuesta",
  "30": "30 días — cierre",
  "7": "7 días — urgente",
  overdue: "Vencida",
};
