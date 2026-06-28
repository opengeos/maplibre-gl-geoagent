import type { Map, StyleSpecification } from 'maplibre-gl';
import type { EarthEngineOptions } from './earth-engine';

export type GeoAgentProviderId =
  | 'openai-responses'
  | 'openai-chat'
  | 'anthropic'
  | 'google'
  | 'bedrock'
  | 'openai-compatible';

export interface GeoAgentProviderConfig {
  id: GeoAgentProviderId;
  label: string;
  keyLabel: string;
  keyPlaceholder: string;
  storageKey: string;
  defaultModel: string;
  defaultRegion?: string;
  /**
   * Whether the provider needs a user-supplied API base URL (OpenAI-compatible
   * / custom endpoints such as a local LLM server or a private deployment).
   */
  requiresBaseUrl?: boolean;
  /** Placeholder shown in the API base URL field. */
  baseUrlPlaceholder?: string;
}

export interface GeoAgentControlOptions {
  /**
   * Whether the panel should start collapsed.
   * @default true
   */
  collapsed?: boolean;

  /**
   * Position of the control button on the map.
   * @default 'top-right'
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  /**
   * Title displayed in the control header.
   * @default 'GeoAgent'
   */
  title?: string;

  /**
   * Width of the floating panel in pixels.
   * @default 390
   */
  panelWidth?: number;

  /**
   * Minimum resizable panel width in pixels.
   * @default 320
   */
  panelMinWidth?: number;

  /**
   * Maximum resizable panel width in pixels.
   * @default 720
   */
  panelMaxWidth?: number;

  /**
   * Height of the floating panel in pixels. When omitted the panel sizes to its
   * content (capped by `panelMaxHeight`) until the user resizes it.
   */
  panelHeight?: number;

  /**
   * Minimum resizable panel height in pixels.
   * @default 320
   */
  panelMinHeight?: number;

  /**
   * Maximum resizable panel height in pixels. The map container height is also
   * enforced as a ceiling, so the panel can be dragged to nearly fill the map.
   * @default 2000
   */
  panelMaxHeight?: number;

  /**
   * Custom CSS class name for the control button container.
   */
  className?: string;

  /**
   * Initial provider when there is no stored provider preference.
   * @default 'openai-responses'
   */
  defaultProvider?: GeoAgentProviderId;

  /**
   * Override the default model for all providers or selected providers.
   */
  defaultModel?: string | Partial<Record<GeoAgentProviderId, string>>;

  /**
   * Prefix for sessionStorage keys.
   * @default 'geoagent.maplibre'
   */
  storagePrefix?: string;

  /**
   * Initial API keys supplied by the host application. Saved sessionStorage
   * values take precedence, and these values are not written to storage unless
   * the user edits the API key field.
   */
  apiKeys?: Partial<Record<GeoAgentProviderId, string>>;

  /**
   * Whether the optional MapLibre JavaScript execution tool starts enabled.
   * @default true
   */
  allowCodeExecutionDefault?: boolean;

  /**
   * Whether destructive layer removal tools start enabled.
   * @default true
   */
  allowDestructiveToolsDefault?: boolean;

  /**
   * Whether to show the permission toggles in the panel.
   * @default false
   */
  showPermissionToggles?: boolean;

  /**
   * Known basemap style IDs available to the agent.
   */
  basemaps?: Record<string, string | StyleSpecification>;

  /**
   * Optional Google Earth Engine tool configuration. Browser OAuth is used by
   * default; host applications may also provide a short-lived access token.
   * Do not provide service account private keys to this browser package.
   */
  earthEngine?: EarthEngineOptions;

  /**
   * Additional domain-specific Strands tools to expose to the agent.
   */
  customTools?: unknown[] | (() => unknown[]);

  /**
   * Additional system instructions appended after the built-in MapLibre
   * instructions. Use this to teach the agent when and how to call custom
   * tools.
   */
  customSystemPrompt?: string;
}

export interface GeoAgentState {
  collapsed: boolean;
  panelWidth: number;
  /** User-set panel height in pixels, or undefined when sized to content. */
  panelHeight?: number;
  busy: boolean;
  providerId: GeoAgentProviderId;
  modelId: string;
  bedrockRegion: string;
  /** API base URL for the OpenAI-compatible / custom provider. */
  baseUrl: string;
  allowCodeExecution: boolean;
  allowDestructiveTools: boolean;
  data?: Record<string, unknown>;
}

export interface GeoAgentControlReactProps extends GeoAgentControlOptions {
  map: Map;
  onStateChange?: (state: GeoAgentState) => void;
}

export type GeoAgentControlEvent = 'collapse' | 'expand' | 'statechange';

export type GeoAgentControlEventHandler = (event: {
  type: GeoAgentControlEvent;
  state: GeoAgentState;
}) => void;
