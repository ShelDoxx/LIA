/**
 * Precarga el SDK de Mercado Pago al entrar a /activar,
 * para que el Brick no arranque “en frío” al elegir el plan.
 */
let warmedKey = "";

export function warmMercadoPago(publicKey: string) {
  const key = publicKey.trim();
  if (!key || warmedKey === key) return;
  warmedKey = key;
  void import("@mercadopago/sdk-react")
    .then(({ initMercadoPago }) => {
      initMercadoPago(key, { locale: "es-AR" });
    })
    .catch((err) => {
      console.warn("[mp] warmup failed", err);
      warmedKey = "";
    });
}
