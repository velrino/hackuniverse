import demoUniverse from "../../data/demo-universe.json";
import { parseUniverseCatalog } from "../../domain/parse-catalog";
import { normalizeDemoCatalog } from "./demo";

/** Curated demo authoring normalizes into the same catalog used by every source. */
export const mockCatalog = parseUniverseCatalog(normalizeDemoCatalog(demoUniverse));
