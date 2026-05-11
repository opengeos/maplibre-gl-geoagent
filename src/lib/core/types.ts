import type { Map, StyleSpecification } from 'maplibre-gl';
import type { EarthEngineOptions } from './earth-engine';

export type GeoAgentProviderId =
  | 'openai-responses'
  | 'openai-chat'
  | 'anthropic'
  | 'google'
  | 'bedrock';

export interface GeoAgentProviderConfig {
  id: GeoAgentProviderId;
  label: string;
  keyLabel: string;
  keyPlaceholder: string;
  storageKey: string;
  defaultModel: string;
  defaultRegion?: string;
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
}

export interface GeoAgentState {
  collapsed: boolean;
  panelWidth: number;
  busy: boolean;
  providerId: GeoAgentProviderId;
  modelId: string;
  bedrockRegion: string;
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
