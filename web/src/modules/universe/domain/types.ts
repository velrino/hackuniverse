export type EntityKind = "universe" | "galaxy" | "cloud" | "system" | "planet";

export type NavigationTarget = Readonly<{ kind: EntityKind; id: string }>;

type EntityFields = Readonly<{
  id: string;
  name: string;
  description: string;
  seed: number;
  type?: "demo";
}>;

export type CatalogReference = Readonly<{ label: string; href?: string }>;
export type PlanetReference = CatalogReference;

export type SystemStar = Readonly<{
  name: string;
  description: string;
  spectralType?: string;
  temperatureK?: number;
  radiusKm?: number;
  ageBillionYears?: number;
  reference?: CatalogReference;
}>;

export type UniverseGroup = EntityFields & Readonly<
  | { kind: Exclude<EntityKind, "planet" | "system">; parentId: string | null }
  | { kind: "system"; parentId: string | null; star?: SystemStar }
>;

export type UniversePlanet = EntityFields & Readonly<{
  kind: "planet";
  parentId: string;
  reference?: PlanetReference;
  tags?: readonly string[];
}>;

export type UniverseEntity = UniverseGroup | UniversePlanet;

export type UniverseCatalogDocument = Readonly<{
  schemaVersion: 1;
  mode: "demo" | "live";
  rootId: string;
  initialTarget?: NavigationTarget;
  entities: readonly UniverseEntity[];
}>;

export type UniverseCatalog = Readonly<Omit<UniverseCatalogDocument, "initialTarget"> & {
  initialTarget: NavigationTarget;
  planets: readonly UniversePlanet[];
}>;

export type SceneNode = {
  id: string;
  kind: EntityKind;
  name: string;
  subtitle: string;
  count: number;
  seed: number;
  color: string;
  children?: SceneNode[];
};

export type UniverseSceneView = {
  key: string;
  mode: "system" | "cluster" | "planet";
  nodes: SceneNode[];
  anchor?: SceneNode;
  ancestors?: readonly SceneNode[];
  starName?: string;
};
