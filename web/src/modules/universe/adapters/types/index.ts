import type { ComponentType, ReactNode } from "react";
import type { UniverseCatalog } from "../../domain/types";
import type { UniverseCopy } from "../../messages";
import type { UniverseSceneProps } from "../../scene/types";

export type UniverseAdapters = {
  catalog: UniverseCatalog;
  copy: UniverseCopy;
  components: {
    Scene: ComponentType<UniverseSceneProps>;
    LanguagePicker: ComponentType;
    BrandLogo: ComponentType<{ size?: number; alt?: string; className?: string; eager?: boolean }>;
    DesignLink: ComponentType<{ children: ReactNode; className?: string }>;
  };
};
