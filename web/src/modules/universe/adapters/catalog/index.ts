import demoUniverse from "../../data/demo-universe.json";
import { parseUniverseCatalog } from "../../domain/parse-catalog";

/** One explicit, synthetic demo catalog; this creates no accounts or imports. */
export const mockCatalog = parseUniverseCatalog(demoUniverse);
