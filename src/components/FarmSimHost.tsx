import { useEffect, useRef, useState } from "react";

const SCRIPT_FILES = [
  "xorshift.js",
  "FarmGame.js",
  "together-bridge.js",
  "i18next-1.7.2.js",
  "translation.js",
  "farmsimDiv.embed.js",
] as const;

function farmsimBaseUrl(): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : `${base}/`}farmsim/`;
}

function loadScriptOnce(src: string, id: string): Promise<void> {
  const existing = document.querySelector(`script[data-tf-farmsim="${id}"]`);
  if (existing) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.tfFarmsim = id;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

let farmSimScriptsPromise: Promise<void> | null = null;

async function ensureFarmSimScripts(): Promise<void> {
  const w = window as unknown as {
    __togetherFarmScriptsReady?: boolean;
    __TOGETHER_FARMSIM_BASE__?: string;
  };
  if (w.__togetherFarmScriptsReady) return;

  if (!farmSimScriptsPromise) {
    farmSimScriptsPromise = (async () => {
      const base = farmsimBaseUrl();
      w.__TOGETHER_FARMSIM_BASE__ = base;
      for (const f of SCRIPT_FILES) {
        await loadScriptOnce(`${base}${f}`, f);
      }
      w.__togetherFarmScriptsReady = true;
    })();
  }

  await farmSimScriptsPromise;
}

export type FarmSimHostProps = {
  gameStateJson: string | null;
  className?: string;
};

/**
 * Monta el simulador de granja en el documento de la SPA (sin iframe).
 * Los scripts viven en /public/farmsim y se cargan una sola vez.
 */
export function FarmSimHost({ gameStateJson, className }: FarmSimHostProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scriptsReady, setScriptsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureFarmSimScripts()
      .then(() => {
        if (!cancelled) setScriptsReady(true);
      })
      .catch((e) => {
        console.error(e);
      });
    return () => {
      cancelled = true;
      const w = window as unknown as { __togetherFarmTeardown?: () => void };
      w.__togetherFarmTeardown?.();
    };
  }, []);

  useEffect(() => {
    if (!scriptsReady || !rootRef.current) return;
    window.postMessage(
      {
        source: "together-farm-parent",
        type: "init",
        saveJson: gameStateJson,
      },
      "*",
    );
  }, [scriptsReady, gameStateJson]);

  return (
    <div
      ref={rootRef}
      id="together-farm-sim-root"
      className={["relative isolate", className].filter(Boolean).join(" ")}
    />
  );
}
