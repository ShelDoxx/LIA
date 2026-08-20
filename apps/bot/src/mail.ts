/**
 * Envío de email para OTP.
 * - RESEND_API_KEY → Resend (recomendado)
 * - EMAIL_DEV_MODE=true → solo log (y el endpoint puede devolver el código)
 */
export async function sendOtpEmail(opts: {
  to: string;
  code: string;
  resendApiKey?: string;
  from?: string;
  devMode?: boolean;
}): Promise<{ ok: boolean; detail?: string }> {
  const from = opts.from || "Lía <onboarding@resend.dev>";
  const subject = "Tu código de acceso a Lía";
  const text = `Tu código para entrar a Lía es: ${opts.code}\n\nVale 10 minutos. Si no pediste esto, ignorá el mail.`;
  const html = `<p>Tu código para entrar a Lía es:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${opts.code}</p><p>Vale 10 minutos.</p>`;

  if (opts.devMode && !opts.resendApiKey) {
    console.log(`[auth] DEV OTP for ${opts.to}: ${opts.code}`);
    return { ok: true, detail: "dev_mode" };
  }

  if (!opts.resendApiKey) {
    console.warn("[auth] sin RESEND_API_KEY — no se envió mail. Activá EMAIL_DEV_MODE o configurá Resend.");
    return { ok: false, detail: "email_not_configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[auth] resend error", res.status, body.slice(0, 400));
    return { ok: false, detail: `resend_${res.status}` };
  }
  return { ok: true, detail: "sent" };
}
