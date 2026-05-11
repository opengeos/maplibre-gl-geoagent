export interface EarthEngineOptions {
  enabled?: boolean;
  oauthClientId?: string;
  projectId?: string;
  includeCommunityCatalog?: boolean;
  catalogCacheTtlMs?: number;
}

export type GeeAssetType =
  | "Image"
  | "ImageCollection"
  | "FeatureCollection"
  | "BigQueryTable"
  | "Unknown";

export interface GeeDataset {
  id: string;
  name?: string;
  title?: string;
  type?: GeeAssetType | string;
  category?: string;
  provider?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  keywords?: string[];
  url?: string;
  license?: string;
  source?: "official" | "community";
  bigquery_table?: string;
  bbox?: string;
  script?: string;
  thumbnail?: string;
  catalog_url?: string;
}

export interface EarthEngineLayerRecord {
  name: string;
  asset_id?: string;
  asset_type?: GeeAssetType | string;
  object_type: string;
  vis_params: Record<string, unknown>;
  tile_url?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  eeObject?: unknown;
}

interface CatalogCacheEntry {
  createdAt: number;
  datasets: GeeDataset[];
  staleDatasets?: GeeDataset[];
}

interface EeModule {
  data?: {
    authenticateViaOauth?: (
      clientId: string,
      success?: () => void,
      failure?: (error: unknown) => void,
      scopes?: unknown,
      onImmediateFailed?: () => void,
    ) => void;
    authenticateViaPopup?: (
      success?: () => void,
      failure?: (error: unknown) => void,
    ) => void;
    getAsset?: (
      assetId: string,
      success?: (asset: Record<string, unknown>) => void,
      failure?: (error: unknown) => void,
    ) => void;
    getAuthToken?: () => string | null | undefined;
    getAuthClientId?: () => string | null | undefined;
    clearAuthToken?: () => void;
  };
  initialize?: (
    baseUrl?: string | null,
    tileUrl?: string | null,
    success?: () => void,
    failure?: (error: unknown) => void,
    xsrfToken?: string | null,
    project?: string | null,
  ) => void;
  Image: new (asset: unknown) => EeObject;
  ImageCollection: new (asset: unknown) => EeObject;
  FeatureCollection: new (asset: unknown) => EeObject;
  Geometry: {
    Rectangle: (bbox: number[]) => EeObject;
  };
  Filter: {
    eq: (property: string, value: unknown) => EeObject;
    lt: (property: string, value: unknown) => EeObject;
  };
  Reducer: Record<string, () => EeObject>;
}

interface EeObject {
  [key: string]: unknown;
  serialize?: () => string;
  getMap?: (
    visParams: Record<string, unknown>,
    callback?: (map: Record<string, unknown> | undefined, error?: unknown) => void,
  ) => Record<string, unknown> | void;
  getMapId?: (
    visParams: Record<string, unknown>,
    callback?: (map: Record<string, unknown> | undefined, error?: unknown) => void,
  ) => Record<string, unknown> | void;
  evaluate?: (
    success: (value: unknown) => void,
    failure?: (error: unknown) => void,
  ) => void;
  getInfo?: (callback?: (value: unknown) => void) => unknown;
}

const OFFICIAL_CATALOG_JSON_URL =
  "https://raw.githubusercontent.com/opengeos/Earth-Engine-Catalog/master/gee_catalog.json";
const OFFICIAL_CATALOG_TSV_URL =
  "https://raw.githubusercontent.com/opengeos/Earth-Engine-Catalog/master/gee_catalog.tsv";
const COMMUNITY_CATALOG_JSON_URL =
  "https://raw.githubusercontent.com/samapriya/awesome-gee-community-datasets/master/community_datasets.json";
const COMMUNITY_CATALOG_CSV_URL =
  "https://raw.githubusercontent.com/samapriya/awesome-gee-community-datasets/master/community_datasets.csv";

const DEFAULT_CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOG_CACHE = new Map<string, CatalogCacheEntry>();

const CATEGORY_RAW_TO_DISPLAY: Record<string, string> = {
  agriculture: "Agriculture",
  atmosphere: "Atmosphere",
  climate: "Climate",
  cryosphere: "Cryosphere",
  ecosystems: "Ecosystems",
  "elevation-topography": "Elevation & Topography",
  fire: "Fire",
  "forest-biomass": "Forest & Biomass",
  "infrastructure-boundaries": "Infrastructure & Boundaries",
  "landuse-landcover": "Land Use & Land Cover",
  oceans: "Oceans",
  orthophotos: "Orthophotos",
  "plant-productivity": "Plant Productivity",
  population: "Population",
  precipitation: "Precipitation",
  "satellite-imagery": "Satellite Imagery",
  soil: "Soil",
  "surface-ground-water": "Surface & Ground Water",
  "vegetation-indices": "Vegetation Indices",
  "water-vapor": "Water Vapor",
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Agriculture: ["agriculture", "crop", "cropland", "irrigation"],
  Atmosphere: ["atmosphere", "aerosol", "ozone", "air quality"],
  Climate: ["climate", "temperature", "era5", "ecmwf"],
  Cryosphere: ["ice", "snow", "glacier", "arctic"],
  Ecosystems: ["ecosystem", "habitat", "biodiversity"],
  "Elevation & Topography": ["elevation", "dem", "srtm", "terrain"],
  Fire: ["fire", "burn", "wildfire"],
  "Forest & Biomass": ["forest", "tree", "biomass", "canopy"],
  "Infrastructure & Boundaries": ["boundary", "admin", "tiger", "urban"],
  "Land Use & Land Cover": ["landcover", "land cover", "lulc", "worldcover"],
  Oceans: ["ocean", "marine", "sst", "coastal"],
  Orthophotos: ["orthophoto", "aerial", "naip"],
  "Plant Productivity": ["gpp", "npp", "productivity"],
  Population: ["population", "demographic", "worldpop"],
  Precipitation: ["precipitation", "rainfall", "chirps", "gpm"],
  "Satellite Imagery": ["landsat", "sentinel", "modis", "viirs", "satellite"],
  Soil: ["soil", "soil moisture"],
  "Surface & Ground Water": ["water", "hydrology", "flood", "jrc"],
  "Vegetation Indices": ["ndvi", "evi", "vegetation", "savi"],
  "Water Vapor": ["water vapor", "humidity"],
};

export function parseList(value: unknown): string[] | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  if (Array.isArray(value)) {
    const items = value.map(String).map((item) => item.trim()).filter(Boolean);
    return items.length ? items : undefined;
  }
  const items = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

export function parseBbox(value: unknown): number[] | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const values = Array.isArray(value) ? value : String(value).split(",");
  if (values.length !== 4) {
    throw new Error("bbox must contain west,south,east,north");
  }
  const bbox = values.map(Number);
  if (!bbox.every(Number.isFinite)) {
    throw new Error("bbox coordinates must be finite numbers");
  }
  const [west, south, east, north] = bbox;
  if (west >= east || south >= north) {
    throw new Error("bbox coordinates must satisfy west < east and south < north");
  }
  return bbox;
}

export function geePaletteColors(value: unknown): string[] | undefined {
  const parsed = parseList(value);
  if (!parsed) {
    return undefined;
  }
  if (parsed.length > 1) {
    return parsed;
  }
  const name = parsed[0].toLowerCase();
  const palettes: Record<string, string[]> = {
    terrain: ["#1a9850", "#91cf60", "#fee08b", "#d08b39", "#f5f5f5"],
    dem: ["#1a9850", "#91cf60", "#fee08b", "#d08b39", "#f5f5f5"],
    elevation: ["#1a9850", "#91cf60", "#fee08b", "#d08b39", "#f5f5f5"],
    earth: ["#1a9850", "#91cf60", "#fee08b", "#d08b39", "#f5f5f5"],
    viridis: ["#440154", "#31688e", "#35b779", "#fde725"],
    grayscale: ["#000000", "#ffffff"],
    grey: ["#000000", "#ffffff"],
    gray: ["#000000", "#ffffff"],
  };
  return palettes[name] ?? parsed;
}

export function buildGeeVisParams(input: {
  bands?: unknown;
  min_value?: unknown;
  max_value?: unknown;
  palette?: unknown;
  forFeatureCollection?: boolean;
}): Record<string, unknown> {
  const visParams: Record<string, unknown> = {};
  const bands = parseList(input.bands);
  if (bands && !input.forFeatureCollection) {
    visParams.bands = bands;
  }
  if (input.min_value != null && !input.forFeatureCollection) {
    visParams.min = Number(input.min_value);
  }
  if (input.max_value != null && !input.forFeatureCollection) {
    visParams.max = Number(input.max_value);
  }
  const palette = geePaletteColors(input.palette);
  if (palette) {
    if (input.forFeatureCollection) {
      visParams.color = palette[0];
    } else {
      visParams.palette = palette;
    }
  }
  return visParams;
}

export function compactGeeDataset(dataset: GeeDataset): GeeDataset {
  const out: GeeDataset = { id: dataset.id };
  for (const key of [
    "id",
    "name",
    "title",
    "type",
    "category",
    "provider",
    "start_date",
    "end_date",
    "source",
    "url",
    "license",
    "bigquery_table",
  ] as Array<keyof GeeDataset>) {
    if (dataset[key]) {
      (out as unknown as Record<string, unknown>)[key] = dataset[key];
    }
  }
  const description = String(dataset.description ?? "").trim();
  if (description) {
    out.description = description.slice(0, 500);
  }
  if (dataset.keywords?.length) {
    out.keywords = dataset.keywords.slice(0, 15);
  }
  return out;
}

export function normalizeGeeAssetType(value: unknown): GeeAssetType {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[_\s-]+/g, "");
  if (normalized === "image" || normalized === "eeimage") {
    return "Image";
  }
  if (normalized === "imagecollection" || normalized === "eeimagecollection") {
    return "ImageCollection";
  }
  if (
    normalized === "featurecollection" ||
    normalized === "table" ||
    normalized === "eefeaturecollection"
  ) {
    return "FeatureCollection";
  }
  if (normalized === "bigquerytable") {
    return "BigQueryTable";
  }
  return "Unknown";
}

function convertRawCategory(rawCategory: unknown): string {
  const first = String(rawCategory ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return CATEGORY_RAW_TO_DISPLAY[first] ?? "Other";
}

function categorizeDataset(dataset: GeeDataset): string {
  const text = [
    dataset.id,
    dataset.title,
    dataset.name,
    dataset.keywords?.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return category;
    }
  }
  return "Other";
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function parseDelimitedRows(content: string, delimiter: "," | "\t"): Record<string, string>[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headerLine = lines.find((line) => line.trim());
  if (!headerLine) {
    return [];
  }
  const headers =
    delimiter === ","
      ? parseCsvLine(headerLine).map((item) => item.trim())
      : headerLine.split("\t").map((item) => item.trim());
  const startIndex = lines.indexOf(headerLine) + 1;
  return lines
    .slice(startIndex)
    .filter((line) => line.trim())
    .map((line) => {
      const values =
        delimiter === "," ? parseCsvLine(line) : line.split("\t");
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return row;
    });
}

function extractBigQueryTable(snippet: unknown): string | undefined {
  const match = String(snippet ?? "").match(/loadBigQueryTable\(['"]([^'"]+)['"]\)/);
  return match?.[1];
}

function officialDatasetFromItem(item: Record<string, unknown>): GeeDataset | null {
  if (item.deprecated === true || String(item.deprecated ?? "").toLowerCase() === "true") {
    return null;
  }
  const type = normalizeGeeAssetType(item.type);
  const keywords = Array.isArray(item.keywords)
    ? item.keywords.map(String)
    : parseList(item.keywords) ?? [];
  const dataset: GeeDataset = {
    id: String(item.id ?? ""),
    name: String(item.title ?? item.id ?? ""),
    title: String(item.title ?? ""),
    type,
    description: String(item.snippet ?? item.description ?? ""),
    provider: String(item.provider ?? ""),
    start_date: String(item.start_date ?? item.state_date ?? ""),
    end_date: String(item.end_date ?? ""),
    bbox: String(item.bbox ?? ""),
    keywords,
    url: String(item.url ?? ""),
    script: String(item.script ?? ""),
    thumbnail: String(item.thumbnail ?? ""),
    license: String(item.license ?? ""),
    catalog_url: String(item.catalog ?? ""),
    source: "official",
  };
  if (type === "BigQueryTable") {
    dataset.bigquery_table = extractBigQueryTable(item.snippet);
  }
  dataset.category = item.category ? convertRawCategory(item.category) : categorizeDataset(dataset);
  return dataset.id ? dataset : null;
}

export function parseOfficialGeeCatalog(content: string, format: "json" | "tsv"): GeeDataset[] {
  if (format === "json") {
    const payload = JSON.parse(content) as unknown;
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { datasets?: unknown }).datasets)
        ? ((payload as { datasets: unknown[] }).datasets)
        : [];
    return items
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map(officialDatasetFromItem)
      .filter((item): item is GeeDataset => item != null);
  }
  return parseDelimitedRows(content, "\t")
    .map((row) => officialDatasetFromItem(row))
    .filter((item): item is GeeDataset => item != null);
}

function communityDatasetFromItem(item: Record<string, unknown>): GeeDataset | null {
  const assetId =
    String(item.id ?? item.asset ?? item.asset_id ?? item.dataset_id ?? "").trim();
  if (!assetId) {
    return null;
  }
  const keywords = Array.isArray(item.keywords)
    ? item.keywords.map(String)
    : parseList(item.keywords ?? item.tags) ?? [];
  const dataset: GeeDataset = {
    id: assetId,
    name: String(item.title ?? item.name ?? assetId),
    title: String(item.title ?? item.name ?? assetId),
    type: normalizeGeeAssetType(item.type ?? item.asset_type),
    description: String(item.description ?? item.snippet ?? ""),
    provider: String(item.provider ?? item.source ?? ""),
    keywords,
    url: String(item.url ?? item.link ?? ""),
    license: String(item.license ?? ""),
    source: "community",
  };
  dataset.category = item.category
    ? String(item.category)
    : categorizeDataset(dataset);
  return dataset;
}

export function parseCommunityGeeCatalog(
  content: string,
  format: "json" | "csv",
): GeeDataset[] {
  if (format === "json") {
    const payload = JSON.parse(content) as unknown;
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { datasets?: unknown }).datasets)
        ? ((payload as { datasets: unknown[] }).datasets)
        : [];
    return items
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map(communityDatasetFromItem)
      .filter((item): item is GeeDataset => item != null);
  }
  return parseDelimitedRows(content, ",")
    .map((row) => communityDatasetFromItem(row))
    .filter((item): item is GeeDataset => item != null);
}

function coerceFilterValue(value: unknown): unknown {
  const text = String(value ?? "").trim();
  if (text.toLowerCase() === "true") {
    return true;
  }
  if (text.toLowerCase() === "false") {
    return false;
  }
  const numberValue = Number(text);
  if (text !== "" && Number.isFinite(numberValue)) {
    return numberValue;
  }
  return text;
}

function defaultIndexPalette(indexName: string): string[] {
  const key = indexName.trim().toUpperCase();
  if (["NDVI", "SAVI", "EVI"].includes(key)) {
    return ["8c510a", "f6e8c3", "f5f5f5", "c7eae5", "01665e"];
  }
  if (["NDWI", "MNDWI", "NDMI"].includes(key)) {
    return ["8c510a", "f7f7f7", "2166ac"];
  }
  if (["NBR", "NBR2"].includes(key)) {
    return ["d7191c", "fdae61", "ffffbf", "a6d96a", "1a9641"];
  }
  return ["d73027", "f7f7f7", "1a9850"];
}

function normalizeCompositeMethod(
  method: unknown,
  defaultMethod: string,
  allowMode = false,
): string {
  const value = String(method ?? "").toLowerCase().trim();
  const allowed = new Set(["mosaic", "median", "mean", "min", "max", "first"]);
  if (allowMode) {
    allowed.add("mode");
  }
  return allowed.has(value) ? value : defaultMethod;
}

function isOperaDswx(assetId: string): boolean {
  return assetId === "OPERA/DSWX/L3_V1/HLS" || assetId === "OPERA/DSWX/L3_V1/S1";
}

function operaDswxDefaultCompositeMethod(assetId: string): string {
  return assetId === "OPERA/DSWX/L3_V1/S1" ? "max" : "mode";
}

function operaDswxBandAlias(value: unknown): string {
  const first = parseList(value)?.[0] ?? "WTR_Water_classification";
  const aliases: Record<string, string> = {
    WTR: "WTR_Water_classification",
    B01_WTR: "WTR_Water_classification",
    WTR_Water_classification: "WTR_Water_classification",
    BWTR: "BWTR_Binary_water",
    BINARY_WATER: "BWTR_Binary_water",
    BWTR_Binary_water: "BWTR_Binary_water",
  };
  return aliases[first] ?? first;
}

function objectTypeName(value: unknown): string {
  const ctorName = (value as { constructor?: { name?: string } } | null)?.constructor?.name;
  return ctorName || typeof value;
}

function eeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatEeInitializeError(error: unknown): string {
  const message = eeErrorMessage(error);
  if (message.includes("Cannot use 'in' operator") && message.includes("Classifier")) {
    return [
      "Earth Engine initialization failed while loading the API algorithms registry.",
      "Verify that the configured Google Cloud project has Earth Engine enabled,",
      "the OAuth consent/client origin matches this page, and the signed-in account has Earth Engine access.",
      `Original error: ${message}`,
    ].join(" ");
  }
  return message;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

export class EarthEngineService {
  private eePromise: Promise<EeModule> | null = null;
  private authPromise: Promise<void> | null = null;
  private initializePromise: Promise<{
    success: boolean;
    project_id?: string;
    authenticated: boolean;
  }> | null = null;
  private initialized = false;
  private initializedProjectId: string | undefined;
  private readonly tileUrlCache = new Map<string, string>();
  private readonly layers = new Map<string, EarthEngineLayerRecord>();

  constructor(private options: EarthEngineOptions = {}) {}

  updateOptions(options: EarthEngineOptions): void {
    const previousOauthClientId = normalizeOptionalString(this.options.oauthClientId);
    const previousProjectId = normalizeOptionalString(this.options.projectId);
    const nextOauthClientId = normalizeOptionalString(options.oauthClientId);
    const nextProjectId = normalizeOptionalString(options.projectId);
    this.options = { ...this.options, ...options };
    if (
      previousOauthClientId !== nextOauthClientId ||
      previousProjectId !== nextProjectId
    ) {
      this.initialized = false;
      this.initializedProjectId = undefined;
      this.tileUrlCache.clear();
    }
  }

  get enabled(): boolean {
    return this.options.enabled !== false;
  }

  get initializedState(): boolean {
    return this.initialized;
  }

  listLoadedLayers(): EarthEngineLayerRecord[] {
    return Array.from(this.layers.values()).map(({ eeObject: _eeObject, ...record }) => ({
      ...record,
      vis_params: { ...record.vis_params },
      metadata: record.metadata ? { ...record.metadata } : undefined,
    }));
  }

  getLayerPayload(layerName: string): EarthEngineLayerRecord {
    const exact = this.layers.get(layerName);
    if (exact) {
      return exact;
    }
    const requested = layerName.trim().toLowerCase();
    let matches = Array.from(this.layers.values()).filter(
      (layer) => layer.name.trim().toLowerCase() === requested,
    );
    if (matches.length === 0) {
      matches = Array.from(this.layers.values()).filter((layer) =>
        layer.name.trim().toLowerCase().includes(requested),
      );
    }
    if (matches.length === 0) {
      throw new Error(`Earth Engine layer not found: ${layerName}`);
    }
    if (matches.length > 1) {
      throw new Error(
        `Earth Engine layer name is ambiguous: ${layerName}. ${matches
          .map((layer) => layer.name)
          .join(", ")}`,
      );
    }
    return matches[0];
  }

  unregisterLayer(name: string): void {
    const key = Array.from(this.layers.keys()).find(
      (candidate) =>
        candidate === name ||
        candidate.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (key) {
      this.layers.delete(key);
    }
  }

  registerLayer(record: EarthEngineLayerRecord): EarthEngineLayerRecord {
    this.layers.set(record.name, record);
    return record;
  }

  async loadEe(): Promise<EeModule> {
    if (!this.eePromise) {
      this.eePromise = import("@google/earthengine").then((module) => {
        const imported = "default" in module ? module.default : module;
        const ee = imported as EeModule;
        const scope = globalThis as typeof globalThis & { ee?: unknown };
        if (!scope.ee) {
          scope.ee = ee;
        }
        return ee;
      });
    }
    return this.eePromise;
  }

  async initialize(input: {
    oauthClientId?: string;
    projectId?: string;
    force?: boolean;
  } = {}): Promise<{ success: boolean; project_id?: string; authenticated: boolean }> {
    const projectId = normalizeOptionalString(input.projectId ?? this.options.projectId);
    const oauthClientId = normalizeOptionalString(input.oauthClientId ?? this.options.oauthClientId);
    const projectMatches =
      this.initializedProjectId === projectId ||
      (!this.initializedProjectId && !projectId);
    if (this.initialized && projectMatches && !input.force) {
      return {
        success: true,
        project_id: projectId,
        authenticated: true,
      };
    }
    if (this.initializePromise && !input.force) {
      return this.initializePromise;
    }
    const promise = this.initializeInternal({ oauthClientId, projectId });
    this.initializePromise = promise;
    try {
      return await promise;
    } finally {
      if (this.initializePromise === promise) {
        this.initializePromise = null;
      }
    }
  }

  private async initializeInternal(input: {
    oauthClientId?: string;
    projectId?: string;
  }): Promise<{ success: boolean; project_id?: string; authenticated: boolean }> {
    const ee = await this.loadEe();
    await this.ensureAuthenticated(ee, input.oauthClientId);
    await new Promise<void>((resolve, reject) => {
      if (!ee.initialize) {
        reject(new Error("Earth Engine initialize is unavailable."));
        return;
      }
      try {
        ee.initialize(
          null,
          null,
          () => resolve(),
          (error: unknown) => reject(new Error(formatEeInitializeError(error))),
          null,
          input.projectId || null,
        );
      } catch (error) {
        reject(new Error(formatEeInitializeError(error)));
      }
    });
    this.initialized = true;
    this.initializedProjectId = input.projectId;
    this.tileUrlCache.clear();
    return { success: true, project_id: input.projectId, authenticated: true };
  }

  private async ensureAuthenticated(
    ee: EeModule,
    oauthClientId?: string,
  ): Promise<void> {
    const token = ee.data?.getAuthToken?.();
    const currentAuthClientId = normalizeOptionalString(ee.data?.getAuthClientId?.());
    if (token) {
      if (!oauthClientId || !currentAuthClientId || currentAuthClientId === oauthClientId) {
        return;
      }
      ee.data?.clearAuthToken?.();
    }
    if (this.authPromise) {
      return this.authPromise;
    }
    if (!oauthClientId) {
      throw new Error(
        "Earth Engine OAuth client ID is required. Pass earthEngine.oauthClientId or oauth_client_id.",
      );
    }
    this.authPromise = new Promise<void>((resolve, reject) => {
      const onSuccess = () => resolve();
      const onFailure = (error: unknown) => reject(new Error(eeErrorMessage(error)));
      const onImmediateFailed = () => {
        if (!ee.data?.authenticateViaPopup) {
          reject(new Error("Earth Engine popup authentication is unavailable."));
          return;
        }
        ee.data.authenticateViaPopup(onSuccess, onFailure);
      };
      if (!ee.data?.authenticateViaOauth) {
        reject(new Error("Earth Engine OAuth authentication is unavailable."));
        return;
      }
      ee.data.authenticateViaOauth(
        oauthClientId,
        onSuccess,
        onFailure,
        undefined,
        onImmediateFailed,
      );
    }).finally(() => {
      this.authPromise = null;
    });
    return this.authPromise;
  }

  async catalog(includeCommunity = this.options.includeCommunityCatalog ?? true): Promise<GeeDataset[]> {
    const key = includeCommunity ? "all" : "official";
    const ttl = this.options.catalogCacheTtlMs ?? DEFAULT_CATALOG_CACHE_TTL_MS;
    const cached = CATALOG_CACHE.get(key);
    const now = Date.now();
    if (cached && now - cached.createdAt <= ttl) {
      return cached.datasets;
    }
    try {
      const official = await fetchCatalogWithFallback<GeeDataset[]>(
        OFFICIAL_CATALOG_JSON_URL,
        (text) => parseOfficialGeeCatalog(text, "json"),
        OFFICIAL_CATALOG_TSV_URL,
        (text) => parseOfficialGeeCatalog(text, "tsv"),
      );
      const community = includeCommunity
        ? await fetchCatalogWithFallback<GeeDataset[]>(
            COMMUNITY_CATALOG_JSON_URL,
            (text) => parseCommunityGeeCatalog(text, "json"),
            COMMUNITY_CATALOG_CSV_URL,
            (text) => parseCommunityGeeCatalog(text, "csv"),
          )
        : [];
      const datasets = [...official, ...community];
      CATALOG_CACHE.set(key, {
        createdAt: now,
        datasets,
        staleDatasets: cached?.datasets ?? cached?.staleDatasets,
      });
      return datasets;
    } catch (error) {
      const stale = cached?.datasets ?? cached?.staleDatasets;
      if (stale) {
        return stale;
      }
      throw error;
    }
  }

  async searchDatasets(input: {
    query?: string;
    category?: string;
    data_type?: string;
    source?: string;
    max_results?: number;
    include_community?: boolean;
  }): Promise<{ count: number; shown: number; datasets: GeeDataset[] }> {
    const datasets = await this.catalog(input.include_community ?? true);
    const query = (input.query ?? "").trim().toLowerCase();
    const maxResults = Math.max(1, Number(input.max_results ?? 20));
    const results = datasets
      .filter((dataset) => {
        if (input.category && dataset.category !== input.category) {
          return false;
        }
        if (input.source && dataset.source !== input.source) {
          return false;
        }
        if (
          input.data_type &&
          normalizeGeeAssetType(dataset.type) !== normalizeGeeAssetType(input.data_type)
        ) {
          return false;
        }
        return true;
      })
      .map((dataset) => ({ dataset, score: datasetSearchScore(dataset, query) }))
      .filter((item) => !query || item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (a.dataset.source !== b.dataset.source) {
          return a.dataset.source === "official" ? -1 : 1;
        }
        return String(a.dataset.name ?? a.dataset.id).localeCompare(
          String(b.dataset.name ?? b.dataset.id),
        );
      })
      .map((item) => item.dataset);
    return {
      count: results.length,
      shown: Math.min(results.length, maxResults),
      datasets: results.slice(0, maxResults).map(compactGeeDataset),
    };
  }

  async getDatasetInfo(
    assetId: string,
    includeCommunity = true,
  ): Promise<GeeDataset & { found: boolean; asset_id?: string }> {
    const datasets = await this.catalog(includeCommunity);
    const found = datasets.find((dataset) => dataset.id === assetId);
    if (!found) {
      return { asset_id: assetId, id: assetId, found: false };
    }
    return { ...compactGeeDataset(found), found: true };
  }

  async summarizeCatalog(
    includeCommunity = true,
  ): Promise<{ total_count: number; categories: Array<{ category: string; count: number }> }> {
    const datasets = await this.catalog(includeCommunity);
    const counts = new Map<string, number>();
    for (const dataset of datasets) {
      const category = dataset.category || "Other";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return {
      total_count: datasets.length,
      categories: Array.from(counts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => a.category.localeCompare(b.category)),
    };
  }

  async detectAssetType(assetId: string, explicitType?: unknown): Promise<GeeAssetType> {
    const normalized = normalizeGeeAssetType(explicitType);
    if (normalized !== "Unknown") {
      return normalized;
    }
    try {
      const dataset = await this.getDatasetInfo(assetId, this.options.includeCommunityCatalog ?? true);
      const catalogType = normalizeGeeAssetType(dataset.type);
      if (catalogType !== "Unknown") {
        return catalogType;
      }
    } catch {
      // Continue to API detection.
    }
    try {
      const ee = await this.loadEe();
      if (ee.data?.getAsset) {
        const asset = await new Promise<Record<string, unknown>>((resolve, reject) => {
          ee.data!.getAsset!(
            assetId,
            (value) => resolve(value),
            (error) => reject(new Error(eeErrorMessage(error))),
          );
        });
        const apiType = normalizeGeeAssetType(asset.type);
        if (apiType !== "Unknown") {
          return apiType;
        }
      }
    } catch {
      // Fall back below.
    }
    return "Image";
  }

  async buildDatasetLayer(input: Record<string, unknown>): Promise<{
    asset_id: string;
    asset_type: GeeAssetType;
    layer_name: string;
    eeObject: EeObject;
    vis_params: Record<string, unknown>;
    composite_method?: string;
    requested_reducer?: string;
    rendered_band?: string;
    diagnostics: Record<string, unknown>;
    bbox?: number[];
    bounds?: Record<string, unknown> | null;
    clip?: Record<string, unknown> | null;
  }> {
    await this.initialize({
      oauthClientId: String(input.oauth_client_id ?? this.options.oauthClientId ?? ""),
      projectId: String(input.project_id ?? this.options.projectId ?? ""),
    });
    const ee = await this.loadEe();
    const assetId = String(input.asset_id ?? "").trim();
    if (!assetId) {
      throw new Error("load_gee_dataset requires asset_id.");
    }
    const assetType = await this.detectAssetType(assetId, input.asset_type);
    const layerName = String(input.layer_name ?? assetId.split("/").at(-1) ?? assetId).slice(0, 50);
    const bbox = parseBbox(input.bbox);
    const boundsCollection = buildFilteredFeatureCollection(ee, {
      assetId: input.bounds_collection_asset_id,
      property: input.bounds_filter_property,
      value: input.bounds_filter_value,
    });
    const clipCollection = buildFilteredFeatureCollection(ee, {
      assetId: input.clip_collection_asset_id,
      property: input.clip_filter_property,
      value: input.clip_filter_value,
    });
    const diagnostics: Record<string, unknown> = {};
    let eeObject: EeObject;
    let visParams: Record<string, unknown>;
    let method: string | undefined;
    let renderedBand: string | undefined;
    if (assetType === "ImageCollection") {
      let collection = new ee.ImageCollection(assetId);
      if (input.start_date || input.end_date) {
        collection = callEeMethod(collection, "filterDate", input.start_date, input.end_date);
      }
      if (boundsCollection) {
        collection = callEeMethod(collection, "filterBounds", boundsCollection);
      } else if (bbox) {
        collection = callEeMethod(collection, "filterBounds", ee.Geometry.Rectangle(bbox));
      }
      if (isOperaDswx(assetId)) {
        method = normalizeCompositeMethod(
          input.reducer,
          operaDswxDefaultCompositeMethod(assetId),
          true,
        );
        if (method !== "max" && method !== "mode") {
          method = operaDswxDefaultCompositeMethod(assetId);
        }
        renderedBand = operaDswxBandAlias(input.bands);
        const rendered = renderOperaDswx(ee, collection, renderedBand, method);
        eeObject = rendered.eeObject;
        visParams = rendered.visParams;
      } else {
        if (input.cloud_cover != null) {
          collection = callEeMethod(
            collection,
            "filter",
            ee.Filter.lt(
              String(input.cloud_property ?? "CLOUDY_PIXEL_PERCENTAGE"),
              Number(input.cloud_cover),
            ),
          );
        }
        method = normalizeCompositeMethod(input.reducer, "mosaic", true);
        eeObject = compositeImageCollection(ee, collection, method);
        visParams = buildGeeVisParams({
          bands: input.bands,
          min_value: input.min_value,
          max_value: input.max_value,
          palette: input.palette,
        });
      }
      if (input.diagnose) {
        diagnostics.bbox = bbox;
      }
    } else if (assetType === "FeatureCollection") {
      eeObject = new ee.FeatureCollection(assetId);
      visParams = buildGeeVisParams({
        palette: input.palette,
        forFeatureCollection: true,
      });
    } else {
      eeObject = new ee.Image(assetId);
      visParams = buildGeeVisParams({
        bands: input.bands,
        min_value: input.min_value,
        max_value: input.max_value,
        palette: input.palette,
      });
    }
    if (clipCollection && assetType !== "FeatureCollection") {
      eeObject = callEeMethod(new ee.Image(eeObject), "clipToCollection", clipCollection);
    }
    return {
      asset_id: assetId,
      asset_type: assetType,
      layer_name: layerName,
      eeObject,
      vis_params: visParams,
      composite_method: method,
      requested_reducer: assetType === "ImageCollection" ? String(input.reducer ?? "mosaic") : undefined,
      rendered_band: renderedBand,
      diagnostics,
      bbox,
      bounds: boundsCollection
        ? {
            collection_asset_id: input.bounds_collection_asset_id,
            filter_property: input.bounds_filter_property,
            filter_value:
              input.bounds_filter_value == null
                ? null
                : coerceFilterValue(input.bounds_filter_value),
            method: "ImageCollection.filterBounds",
          }
        : null,
      clip: clipCollection
        ? {
            collection_asset_id: input.clip_collection_asset_id,
            filter_property: input.clip_filter_property,
            filter_value: input.clip_filter_value,
            method: "ee.Image.clipToCollection",
          }
        : null,
    };
  }

  async buildNormalizedDifferenceLayer(input: Record<string, unknown>): Promise<{
    asset_id: string;
    asset_type: GeeAssetType;
    layer_name: string;
    eeObject: EeObject;
    vis_params: Record<string, unknown>;
    index_name: string;
    formula: string;
    bands: string[];
    composite_method?: string;
    requested_reducer?: string;
    bbox?: number[];
    bounds?: Record<string, unknown> | null;
    clip?: Record<string, unknown> | null;
  }> {
    await this.initialize({
      oauthClientId: String(input.oauth_client_id ?? this.options.oauthClientId ?? ""),
      projectId: String(input.project_id ?? this.options.projectId ?? ""),
    });
    const ee = await this.loadEe();
    const assetId = String(input.asset_id ?? "").trim();
    const positiveBand = String(input.positive_band ?? "").trim();
    const negativeBand = String(input.negative_band ?? "").trim();
    if (!assetId || !positiveBand || !negativeBand) {
      throw new Error(
        "calculate_gee_normalized_difference requires asset_id, positive_band, and negative_band.",
      );
    }
    const detectedType = await this.detectAssetType(assetId, input.asset_type);
    if (detectedType === "FeatureCollection") {
      throw new Error("Normalized difference indexes require an Image or ImageCollection.");
    }
    const bbox = parseBbox(input.bbox);
    const boundsCollection = buildFilteredFeatureCollection(ee, {
      assetId: input.bounds_collection_asset_id,
      property: input.bounds_filter_property,
      value: input.bounds_filter_value,
    });
    const clipCollection = buildFilteredFeatureCollection(ee, {
      assetId: input.clip_collection_asset_id,
      property: input.clip_filter_property,
      value: input.clip_filter_value,
    });
    let sourceImage: EeObject;
    let method: string | undefined;
    let assetType = detectedType;
    if (detectedType === "ImageCollection") {
      let collection = new ee.ImageCollection(assetId);
      if (input.start_date || input.end_date) {
        collection = callEeMethod(collection, "filterDate", input.start_date, input.end_date);
      }
      if (boundsCollection) {
        collection = callEeMethod(collection, "filterBounds", boundsCollection);
      } else if (bbox) {
        collection = callEeMethod(collection, "filterBounds", ee.Geometry.Rectangle(bbox));
      }
      if (input.cloud_cover != null) {
        collection = callEeMethod(
          collection,
          "filter",
          ee.Filter.lt(
            String(input.cloud_property ?? "CLOUDY_PIXEL_PERCENTAGE"),
            Number(input.cloud_cover),
          ),
        );
      }
      method = normalizeCompositeMethod(input.reducer, "median");
      sourceImage = compositeImageCollection(ee, collection, method);
    } else {
      assetType = "Image";
      sourceImage = new ee.Image(assetId);
    }
    const indexName = String(input.index_name ?? "NDVI").trim() || "ND";
    let indexImage = callEeMethod(
      sourceImage,
      "normalizedDifference",
      [positiveBand, negativeBand],
    );
    indexImage = callEeMethod(indexImage, "rename", indexName);
    if (clipCollection) {
      indexImage = callEeMethod(new ee.Image(indexImage), "clipToCollection", clipCollection);
    }
    const visParams = buildGeeVisParams({
      bands: indexName,
      min_value: input.min_value ?? -1,
      max_value: input.max_value ?? 1,
      palette: input.palette ?? defaultIndexPalette(indexName),
    });
    const layerName = String(
      input.layer_name ?? `${assetId.split("/").at(-1) ?? assetId} ${indexName}`,
    ).slice(0, 50);
    return {
      asset_id: assetId,
      asset_type: assetType,
      layer_name: layerName,
      eeObject: indexImage,
      vis_params: visParams,
      index_name: indexName,
      formula: `(${positiveBand} - ${negativeBand}) / (${positiveBand} + ${negativeBand})`,
      bands: [positiveBand, negativeBand],
      composite_method: method,
      requested_reducer: detectedType === "ImageCollection" ? String(input.reducer ?? "median") : undefined,
      bbox,
      bounds: boundsCollection
        ? {
            collection_asset_id: input.bounds_collection_asset_id,
            filter_property: input.bounds_filter_property,
            filter_value:
              input.bounds_filter_value == null
                ? null
                : coerceFilterValue(input.bounds_filter_value),
            method: "ImageCollection.filterBounds",
          }
        : null,
      clip: clipCollection
        ? {
            collection_asset_id: input.clip_collection_asset_id,
            filter_property: input.clip_filter_property,
            filter_value: input.clip_filter_value,
            method: "ee.Image.clipToCollection",
          }
        : null,
    };
  }

  async getTileUrl(eeObject: EeObject, visParams: Record<string, unknown>): Promise<string> {
    const renderable = renderableEeObjectForTiles(eeObject, visParams);
    const cacheKey = this.tileCacheKey(renderable.eeObject, renderable.visParams);
    const cached = cacheKey ? this.tileUrlCache.get(cacheKey) : undefined;
    if (cached) {
      return cached;
    }
    const tileUrl = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (mapInfo: Record<string, unknown> | undefined, error?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(new Error(`Earth Engine getMapId failed: ${eeErrorMessage(error)}`));
          return;
        }
        const url = extractTileUrl(mapInfo);
        if (url) {
          resolve(url);
        } else {
          reject(new Error("Earth Engine did not return a tile URL."));
        }
      };
      try {
        const callback = (
          mapInfo: Record<string, unknown> | undefined,
          error?: unknown,
        ) => finish(mapInfo, error);
        const result =
          typeof renderable.eeObject.getMap === "function"
            ? renderable.eeObject.getMap(renderable.visParams, callback)
            : renderable.eeObject.getMapId?.(renderable.visParams, callback);
        if (result) {
          finish(result);
        }
      } catch (error) {
        reject(error);
      }
    });
    if (cacheKey) {
      this.tileUrlCache.set(cacheKey, tileUrl);
    }
    return tileUrl;
  }

  async setLayerVisualization(input: Record<string, unknown>): Promise<{
    success: boolean;
    layer_name: string;
    source_layer_name: string;
    eeObject: unknown;
    vis_params: Record<string, unknown>;
    tile_url: string;
  }> {
    const matched = this.getLayerPayload(String(input.layer_name ?? ""));
    const requestedVis = buildGeeVisParams({
      bands: input.bands,
      min_value: input.min_value,
      max_value: input.max_value,
      palette: input.palette,
    });
    const visParams = { ...matched.vis_params, ...requestedVis };
    const outputName = String(input.output_layer_name ?? matched.name).slice(0, 50);
    const eeObject = matched.eeObject as EeObject;
    const tileUrl = await this.getTileUrl(eeObject, visParams);
    this.registerLayer({
      ...matched,
      name: outputName,
      vis_params: visParams,
      tile_url: tileUrl,
      eeObject,
    });
    return {
      success: true,
      layer_name: outputName,
      source_layer_name: matched.name,
      eeObject,
      vis_params: visParams,
      tile_url: tileUrl,
    };
  }

  async runSnippet(
    code: string,
    addLayer: (
      eeObject: unknown,
      visParams: Record<string, unknown>,
      name: string,
    ) => Promise<void>,
  ): Promise<Record<string, unknown>> {
    if (!code.trim()) {
      return {
        success: false,
        error: "No Earth Engine JavaScript snippet was provided.",
        earth_engine_javascript_snippet: code,
      };
    }
    await this.initialize();
    const ee = await this.loadEe();
    const layersAdded: Array<Record<string, unknown>> = [];
    const addEeLayer = async (
      eeObject: unknown,
      visParams: Record<string, unknown> = {},
      name = "Earth Engine Layer",
    ) => {
      const layerName = String(name || "Earth Engine Layer").slice(0, 50);
      await addLayer(eeObject, visParams, layerName);
      layersAdded.push({
        name: layerName,
        vis_params: visParams,
        object_type: objectTypeName(eeObject),
      });
    };
    const mapAdapter = Object.freeze({
      addLayer: addEeLayer,
      add_layer: addEeLayer,
      add_ee_layer: addEeLayer,
    });
    const fn = new Function(
      "ee",
      "Map",
      "addLayer",
      "getEeLayer",
      "listEeLayers",
      `"use strict"; return (async () => {\n${code}\n})()`,
    ) as (
      eeArg: EeModule,
      mapArg: typeof mapAdapter,
      addLayerArg: typeof addEeLayer,
      getEeLayerArg: (name: string) => unknown,
      listEeLayersArg: () => EarthEngineLayerRecord[],
    ) => Promise<unknown>;
    const result = await fn(
      ee,
      mapAdapter,
      addEeLayer,
      (name: string) => this.getLayerPayload(name).eeObject,
      () => this.listLoadedLayers(),
    );
    if (layersAdded.length === 0) {
      return {
        success: false,
        error:
          "The generated Earth Engine JavaScript snippet ran but did not add a layer. Call Map.addLayer(...) or addLayer(...).",
        layers_added: [],
        result,
        earth_engine_javascript_snippet: code,
      };
    }
    return {
      success: true,
      layers_added: layersAdded,
      result,
      earth_engine_javascript_snippet: code,
    };
  }

  async calculateLayerStatistics(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.initialize();
    const ee = await this.loadEe();
    const layerName = String(input.layer_name ?? "");
    const source = this.getLayerPayload(layerName);
    let image = new ee.Image(source.eeObject);
    const band = input.band == null ? "" : String(input.band).trim();
    if (band) {
      image = callEeMethod(image, "select", band);
    }
    let region: unknown = callEeMethod(image, "geometry");
    let regionInfo: Record<string, unknown> | null = null;
    if (input.region_collection_asset_id) {
      let fc = new ee.FeatureCollection(String(input.region_collection_asset_id));
      if (input.region_filter_property && input.region_filter_value != null) {
        fc = callEeMethod(
          fc,
          "filter",
          ee.Filter.eq(
            String(input.region_filter_property),
            coerceFilterValue(input.region_filter_value),
          ),
        );
      }
      region = callEeMethod(fc, "geometry");
      regionInfo = {
        collection_asset_id: input.region_collection_asset_id,
        filter_property: input.region_filter_property,
        filter_value: input.region_filter_value,
      };
    }
    const { reducer, statistics } = buildStatisticsReducer(ee, input.statistics);
    const reduction = callEeMethod(image, "reduceRegion", {
      reducer,
      geometry: region,
      scale: Number(input.scale ?? 1000),
      maxPixels: Number(input.max_pixels ?? 100000000),
      bestEffort: input.best_effort !== false,
      tileScale: Number(input.tile_scale ?? 4),
    });
    const timeoutSeconds = Number(input.timeout_seconds ?? 60);
    const values = await withEeTimeout(
      evaluateEeObject(reduction),
      timeoutSeconds,
      `Earth Engine statistics evaluation timed out after ${timeoutSeconds}s`,
    );
    const valueObject =
      values && typeof values === "object" && !Array.isArray(values)
        ? (values as Record<string, unknown>)
        : { value: values };
    const numericValues = Object.values(valueObject).filter(
      (value): value is number => typeof value === "number",
    );
    return {
      success: true,
      layer_name: layerName,
      band: band || null,
      statistics,
      values: valueObject,
      mean: statistics.length === 1 && statistics[0] === "mean" ? numericValues[0] ?? null : null,
      scale: Number(input.scale ?? 1000),
      max_pixels: Number(input.max_pixels ?? 100000000),
      best_effort: input.best_effort !== false,
      tile_scale: Number(input.tile_scale ?? 4),
      timeout_seconds: timeoutSeconds,
      region: regionInfo,
      approximate: input.best_effort !== false,
    };
  }

  private tileCacheKey(eeObject: EeObject, visParams: Record<string, unknown>): string | null {
    try {
      const serialized =
        typeof eeObject.serialize === "function"
          ? eeObject.serialize()
          : JSON.stringify(eeObject);
      return JSON.stringify([serialized, stableJson(visParams)]);
    } catch {
      return null;
    }
  }
}

async function fetchCatalogWithFallback<T>(
  primaryUrl: string,
  primaryParser: (text: string) => T,
  fallbackUrl: string,
  fallbackParser: (text: string) => T,
): Promise<T> {
  try {
    return primaryParser(await fetchText(primaryUrl));
  } catch {
    return fallbackParser(await fetchText(fallbackUrl));
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch Earth Engine catalog (${response.status}) from ${url}`);
  }
  return response.text();
}

function datasetSearchScore(dataset: GeeDataset, query: string): number {
  if (!query) {
    return 1;
  }
  const id = dataset.id.toLowerCase();
  const title = String(dataset.title ?? dataset.name ?? "").toLowerCase();
  const description = String(dataset.description ?? "").toLowerCase();
  const keywords = (dataset.keywords ?? []).join(" ").toLowerCase();
  let score = 0;
  for (const term of query.split(/\s+/).filter(Boolean)) {
    if (id === term || title === term) {
      score += 100;
    }
    if (id.includes(term)) {
      score += 20;
    }
    if (title.includes(term)) {
      score += 15;
    }
    if (keywords.includes(term)) {
      score += 8;
    }
    if (description.includes(term)) {
      score += 3;
    }
  }
  return score;
}

function callEeMethod(object: EeObject, method: string, ...args: unknown[]): EeObject {
  const fn = object[method];
  if (typeof fn !== "function") {
    throw new Error(`Earth Engine object does not support ${method}.`);
  }
  return (fn as (...methodArgs: unknown[]) => EeObject).apply(object, args);
}

function buildFilteredFeatureCollection(
  ee: EeModule,
  input: { assetId?: unknown; property?: unknown; value?: unknown },
): EeObject | null {
  if (!input.assetId) {
    return null;
  }
  let collection = new ee.FeatureCollection(String(input.assetId));
  if (input.property && input.value != null) {
    collection = callEeMethod(
      collection,
      "filter",
      ee.Filter.eq(String(input.property), coerceFilterValue(input.value)),
    );
  }
  return collection;
}

function compositeImageCollection(ee: EeModule, collection: EeObject, method: string): EeObject {
  if (method === "mode") {
    return callEeMethod(collection, "reduce", ee.Reducer.mode());
  }
  return callEeMethod(collection, method);
}

function renderOperaDswx(
  ee: EeModule,
  collection: EeObject,
  bandName: string,
  method: string,
): { eeObject: EeObject; visParams: Record<string, unknown> } {
  const binary = bandName === "BWTR_Binary_water";
  const classValues = binary ? [0, 1, 252, 253, 254] : [0, 1, 2, 252, 253, 254];
  const palette = binary
    ? ["ffffff", "0000ff", "f2f2f2", "dfdfdf", "da00ff"]
    : ["ffffff", "0000ff", "0088ff", "f2f2f2", "dfdfdf", "da00ff"];
  const selectedBand = binary ? bandName : "WTR_Water_classification";
  const maskedCollection = callEeMethod(collection, "map", (image: EeObject) => {
    const selected = callEeMethod(image, "select", selectedBand);
    return callEeMethod(
      selected,
      "updateMask",
      callEeMethod(callEeMethod(image, "select", selectedBand), "lt", 252),
    );
  });
  const reducer = method === "max" ? ee.Reducer.max() : ee.Reducer.mode();
  let composite = callEeMethod(maskedCollection, "reduce", reducer);
  composite = callEeMethod(composite, "rename", selectedBand);
  let remapped = callEeMethod(
    callEeMethod(composite, "select", selectedBand),
    "remap",
    classValues,
    classValues.map((_value, index) => index),
  );
  remapped = callEeMethod(remapped, "updateMask", callEeMethod(remapped, "neq", 0));
  return {
    eeObject: remapped,
    visParams: {
      min: 0,
      max: classValues.length - 1,
      palette,
    },
  };
}

function extractTileUrl(mapInfo: Record<string, unknown> | undefined): string | null {
  const tileFetcher = mapInfo?.tile_fetcher as { url_format?: unknown } | undefined;
  const url =
    tileFetcher?.url_format ??
    mapInfo?.urlFormat ??
    mapInfo?.tile_url ??
    mapInfo?.url;
  return typeof url === "string" && url ? url : null;
}

function renderableEeObjectForTiles(
  eeObject: EeObject,
  visParams: Record<string, unknown>,
): { eeObject: EeObject; visParams: Record<string, unknown> } {
  const styleKeys = new Set([
    "color",
    "pointSize",
    "pointShape",
    "width",
    "fillColor",
    "styleProperty",
    "neighborhood",
    "lineType",
  ]);
  const styleParams = Object.fromEntries(
    Object.entries(visParams).filter(([key]) => styleKeys.has(key)),
  );
  if (
    Object.keys(styleParams).length > 0 &&
    typeof eeObject.style === "function"
  ) {
    return {
      eeObject: callEeMethod(eeObject, "style", styleParams),
      visParams: {},
    };
  }
  return { eeObject, visParams };
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const object = value as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = object[key];
        return out;
      }, {}),
  );
}

function buildStatisticsReducer(
  ee: EeModule,
  value: unknown,
): { reducer: EeObject; statistics: string[] } {
  const aliases: Record<string, string> = {
    average: "mean",
    avg: "mean",
    std: "stdDev",
    stdev: "stdDev",
    stddev: "stdDev",
  };
  const supported = new Set(["mean", "min", "max", "median", "stdDev", "sum", "count"]);
  const requested = parseList(value) ?? ["mean"];
  const statistics = requested.map((item) => aliases[item.toLowerCase()] ?? item);
  for (const statistic of statistics) {
    if (!supported.has(statistic)) {
      throw new Error(
        `Unsupported statistic: ${statistic}. Supported statistics: ${Array.from(supported)
          .sort()
          .join(", ")}`,
      );
    }
  }
  let reducer = ee.Reducer[statistics[0]]();
  for (const statistic of statistics.slice(1)) {
    reducer = callEeMethod(reducer, "combine", {
      reducer2: ee.Reducer[statistic](),
      sharedInputs: true,
    });
  }
  return { reducer, statistics };
}

async function withEeTimeout<T>(
  promise: Promise<T>,
  timeoutSeconds: number,
  message: string,
): Promise<T> {
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    return promise;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutSeconds * 1000);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function evaluateEeObject(object: EeObject): Promise<unknown> {
  if (typeof object.evaluate === "function") {
    return new Promise((resolve, reject) => {
      object.evaluate!(
        (value) => resolve(value),
        (error) => reject(new Error(eeErrorMessage(error))),
      );
    });
  }
  if (typeof object.getInfo === "function") {
    const result = object.getInfo();
    if (result !== undefined) {
      return result;
    }
    return new Promise((resolve) => object.getInfo!((value) => resolve(value)));
  }
  return object;
}
