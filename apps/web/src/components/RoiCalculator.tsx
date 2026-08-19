import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { money } from "@/lib/format";

export function RoiCalculator() {
  const [policies, setPolicies] = useState(180);
  const [lostPct, setLostPct] = useState(2);
  const [avgPremium, setAvgPremium] = useState(85000);

  const lostRenewals = Math.max(0, Math.round((policies * lostPct) / 100));
  const saved = useMemo(() => {
    const commission = 0.15;
    return Math.round(lostRenewals * avgPremium * commission * 12);
  }, [lostRenewals, avgPremium]);

  const subscriptionUsd = 49 * 12;

  const [displaySaved, setDisplaySaved] = useState(0);
  const displaySavedRef = useRef(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const didFirstAnimRef = useRef(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) {
      setDisplaySaved(saved);
      displaySavedRef.current = saved;
      return;
    }

    const from = didFirstAnimRef.current ? displaySavedRef.current : 0;
    const to = saved;
    if (from === to) {
      setDisplaySaved(to);
      displaySavedRef.current = to;
      didFirstAnimRef.current = true;
      return;
    }

    const duration = didFirstAnimRef.current ? 450 : 900;
    didFirstAnimRef.current = true;
    const start = performance.now();

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const raf = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(from + (to - from) * easeOutCubic(t));
      setDisplaySaved(v);
      displaySavedRef.current = v;
      if (t < 1) requestAnimationFrame(raf);
    };

    // Arranca la animación.
    requestAnimationFrame(raf);
  }, [saved, isVisible]);

  return (
    <div ref={hostRef}>
      <Card className="p-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Calculadora ROI</p>
        <h3 className="mt-2 font-serif text-2xl">Esto se te está yendo de la cartera</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Pólizas en cartera
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-line px-3 py-2"
              value={policies}
              onChange={(e) => setPolicies(Number(e.target.value) || 0)}
            />
          </label>
          <label className="text-sm">
            % que se te cae / año
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-line px-3 py-2"
              value={lostPct}
              onChange={(e) => setLostPct(Number(e.target.value) || 0)}
            />
          </label>
          <label className="text-sm">
            Prima mensual promedio (ARS)
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-line px-3 py-2"
              value={avgPremium}
              onChange={(e) => setAvgPremium(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <p className="mt-4 font-serif text-4xl text-danger">{money(displaySaved)}</p>
        <p className="mt-1 text-sm text-ink-soft">
          Comisión anual que dejás en la mesa si se caen {lostRenewals} renovación{lostRenewals === 1 ? "" : "es"} (15%
          sobre prima). Lía Estudio es USD {subscriptionUsd}/año: menos que una de esas.
        </p>
      </Card>
    </div>
  );
}
