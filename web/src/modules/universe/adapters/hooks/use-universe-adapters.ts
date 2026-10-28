import { useContext } from "react";
import { AdaptersContext } from "../context/AdaptersContext";

export function useUniverseAdapters() {
  const adapters = useContext(AdaptersContext);
  if (!adapters) throw new Error("Universe adapters are unavailable.");
  return adapters;
}
