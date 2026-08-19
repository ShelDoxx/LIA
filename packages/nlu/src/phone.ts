/** E.164 móvil AR para Meta: 549 + área sin 0 + número sin 15. */
export function normalizePhoneAR(phone: string, areaCode = "11"): string {
  let d = phone.replace(/\D/g, "");
  if (!d) return "";

  if (d.startsWith("00")) d = d.slice(2);

  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);

  if (d.startsWith("9") && d.length >= 10) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);

  if (d.startsWith("15")) d = `${areaCode}${d.slice(2)}`;

  if (d.length === 12) {
    if (d.startsWith("11") && d.slice(2, 4) === "15") d = `11${d.slice(4)}`;
    else if (d.slice(3, 5) === "15") d = `${d.slice(0, 3)}${d.slice(5)}`;
    else if (d.slice(4, 6) === "15") d = `${d.slice(0, 4)}${d.slice(6)}`;
  }

  if (!d) return "";
  return d.startsWith("549") ? d : `549${d}`;
}

/** 10 dígitos nacionales (área+número). Iguala CSV con 15, 0, 9 y el formato Meta. */
export function arMobileKey(phone: string, areaCode = "11"): string {
  const n = normalizePhoneAR(phone, areaCode);
  return n.startsWith("549") ? n.slice(3) : n.slice(-10);
}
