import type { ComponentType } from "react";
import type { DesignSystemCopy } from "../../messages";

export type DesignSystemBrandLogoProps = {
  size?: number;
  alt?: string;
  className?: string;
  eager?: boolean;
};

export type DesignSystemAdapters = {
  localization: { copy: DesignSystemCopy; closeLabel: string };
  components: {
    LanguagePicker: ComponentType;
    BrandLogo: ComponentType<DesignSystemBrandLogoProps>;
  };
  brand: { name: string };
};
