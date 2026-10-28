import { createContext } from "react";
import type { UniverseAdapters } from "../types";

export const AdaptersContext = createContext<UniverseAdapters | null>(null);
