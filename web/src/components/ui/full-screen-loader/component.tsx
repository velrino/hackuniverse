"use client";

import "./full-screen-loader.css";
import { useId, useRef, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export type FullScreenLoaderProps = {
  progress?: number | null;
  label: string;
  detail?: string;
  onCancel?: () => void;
  /** A visible cancel button is shown only when both cancellation props exist. */
  cancelLabel?: string;
};

const meridians = Array.from({ length: 8 }, (_, index) => index * 22.5);
const latitudes = [-60, -30, 0, 30, 60];
const nodes = [
  [-30, 20], [0, 0], [30, 45], [60, -25], [90, 15], [120, -40],
  [150, 35], [180, -15], [210, 50], [240, -35], [270, 20], [300, -10],
];

function sphereNode(longitude: number, latitude: number): CSSProperties {
  const lon = (longitude * Math.PI) / 180;
  const lat = (latitude * Math.PI) / 180;
  const round = (value: number) => value.toFixed(5);

  return {
    "--node-x": round(Math.cos(lat) * Math.sin(lon) * 0.5),
    "--node-y": round(-Math.sin(lat) * 0.5),
    "--node-z": round(Math.cos(lat) * Math.cos(lon) * 0.5),
  } as CSSProperties;
}

/** Mount while work is pending; the caller owns progress and unmounting. */
export function FullScreenLoader({
  progress,
  label,
  detail,
  onCancel,
  cancelLabel,
}: FullScreenLoaderProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const detailId = `${id}-detail`;
  const contentRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef({ x: 0, y: 0 });
  const value = typeof progress === "number" && Number.isFinite(progress)
    ? Math.min(100, Math.max(0, progress))
    : null;
  const hasCancelButton = Boolean(onCancel && cancelLabel?.trim());

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel?.(); }}>
      <DialogContent
        ref={contentRef}
        className="full-screen-loader"
        fullScreen
        showCloseButton={false}
        aria-labelledby={titleId}
        aria-describedby={detail ? detailId : undefined}
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          previousFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
          scrollRef.current = { x: window.scrollX, y: window.scrollY };
          (cancelRef.current ?? contentRef.current)?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (previousFocusRef.current?.isConnected) {
            previousFocusRef.current.focus({ preventScroll: true });
          }
          window.scrollTo(scrollRef.current.x, scrollRef.current.y);
        }}
        onEscapeKeyDown={(event) => { if (!onCancel) event.preventDefault(); }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="planet-loader">
          <div className="planet-loader__frame" aria-hidden="true" />
          <div
            className="planet-loader__graphic"
            role="progressbar"
            aria-labelledby={titleId}
            aria-describedby={detail ? detailId : undefined}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value ?? undefined}
            aria-live="off"
            data-indeterminate={value === null}
          >
            <svg
              className="planet-loader__rings"
              viewBox="0 0 400 400"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="200" cy="200" r="190" className="planet-loader__outer-ring" />
              <circle cx="200" cy="200" r="174" className="planet-loader__dashed-ring" />
              {Array.from({ length: 60 }, (_, index) => (
                <path
                  key={index}
                  d={`M200 ${index % 5 === 0 ? 13 : 17} V23`}
                  transform={`rotate(${index * 6} 200 200)`}
                  className={index % 5 === 0 ? "planet-loader__tick-major" : "planet-loader__tick"}
                />
              ))}
              <circle
                cx="200"
                cy="200"
                r="174"
                pathLength="100"
                strokeDasharray={`${value ?? 16} 100`}
                transform="rotate(-90 200 200)"
                className="planet-loader__progress-arc"
              />
              <g className="planet-loader__satellite">
                <circle cx="200" cy="10" r="3" />
                <circle cx="200" cy="10" r="8" fill="none" />
              </g>
              <path d="M70 111V70h41 M289 70h41v41 M330 289v41h-41 M111 330H70v-41" className="planet-loader__reticle" />
            </svg>

            <div className="planet-loader__globe" aria-hidden="true">
              <div className="planet-loader__sphere">
                {meridians.map((angle) => (
                  <span
                    key={angle}
                    className="planet-loader__meridian"
                    style={{ "--meridian-angle": `${angle}deg` } as CSSProperties}
                  />
                ))}
                {latitudes.map((angle) => (
                  <span
                    key={angle}
                    className="planet-loader__latitude"
                    style={{
                      "--latitude-size": `${(Math.cos(angle * Math.PI / 180) * 100).toFixed(5)}%`,
                      "--latitude-y": `${(Math.sin(angle * Math.PI / 180) * 50).toFixed(5)}%`,
                    } as CSSProperties}
                  />
                ))}
                {nodes.map(([longitude, latitude]) => (
                  <span
                    key={`${longitude}-${latitude}`}
                    className="planet-loader__node"
                    style={sphereNode(longitude, latitude)}
                  />
                ))}
              </div>
            </div>

            <div className="planet-loader__scan" aria-hidden="true" />
            <div className="planet-loader__percentage" aria-hidden="true">
              {value === null ? <span>—</span> : <><span>{Math.round(value)}</span><span className="planet-loader__percent-sign">%</span></>}
            </div>
          </div>

          <div className="planet-loader__copy">
            <DialogTitle id={titleId} className="planet-loader__label">{label}</DialogTitle>
            {detail && <DialogDescription id={detailId} className="planet-loader__detail">{detail}</DialogDescription>}
          </div>
          <div
            className="planet-loader__track"
            aria-hidden="true"
            data-indeterminate={value === null}
            style={{ "--loader-progress": `${value ?? 100}%` } as CSSProperties}
          >
            <span />
          </div>
          {hasCancelButton && <Button ref={cancelRef} type="button" variant="outline" className="hud-button planet-loader__cancel" onClick={onCancel}>{cancelLabel}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
