import demoUniverse from "../../data/demo-universe.json";
import { parseDemoUniverse } from "./parse";

/** One explicit, synthetic demo catalog; this creates no accounts or imports. */
export const mockCatalog = parseDemoUniverse(demoUniverse);
