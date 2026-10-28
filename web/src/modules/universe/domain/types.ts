export type EntityKind = "universe" | "galaxy" | "cloud" | "system" | "planet";

export type NavigationTarget = { kind: EntityKind; id: string };

export type UniverseEntity = {
  id: string;
  kind: EntityKind;
  parentId: string | null;
  name: string;
  description: string;
  seed: number;
};

export type WebsitePlanet = UniverseEntity & {
  kind: "planet";
  parentId: string;
  source: {
    url: string;
    title: string;
    description: string;
    provider: "firecrawl";
    operation: "search";
    query: string;
    position: number;
  };
};

export type UniverseCatalog = {
  mode: "demo";
  rootId: string;
  initialSystemId: string;
  entities: UniverseEntity[];
  planets: WebsitePlanet[];
};

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
  starName?: string;
};
