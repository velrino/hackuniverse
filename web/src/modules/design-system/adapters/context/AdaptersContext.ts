"use client";

import { createContext } from "react";
import type { DesignSystemAdapters } from "../types";

export const AdaptersContext = createContext<DesignSystemAdapters | null>(null);
