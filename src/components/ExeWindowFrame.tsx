import type { ReactNode } from "react";

type ExeWindowFrameProps = {
  title: string;
  children: ReactNode;
  /** Clases del contenedor exterior (p. ej. mx-auto max-w-3xl). */
  className?: string;
  /** Clases del cuerpo bajo la barra de título (padding, etc.). */
  bodyClassName?: string;
};

export function ExeWindowFrame({
  title,
  children,
  className = "",
  bodyClassName = "p-4 sm:p-6",
}: ExeWindowFrameProps) {
  return (
    <div
      className={`overflow-hidden rounded-3xl border-8 border-pastel-pink bg-pastel-mint/40 shadow-sticker ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-2 border-b-4 border-pastel-pink bg-pastel-mint px-3 py-2 sm:px-4">
        <span className="truncate font-display text-xs font-bold uppercase tracking-wide text-ui-ink sm:text-sm">
          {title}
        </span>
        <div className="flex shrink-0 gap-1.5" aria-hidden>
          <span className="h-3 w-3 rounded-full border-2 border-ui-border bg-pastel-yellow" />
          <span className="h-3 w-3 rounded-full border-2 border-ui-border bg-pastel-mint" />
          <span className="h-3 w-3 rounded-full border-2 border-ui-border bg-pastel-pink" />
        </div>
      </div>
      <div className={`bg-pastel-cream/50 ${bodyClassName}`.trim()}>{children}</div>
    </div>
  );
}
