import { useCallback, useState } from 'react';
import type { GeoAgentProviderId, GeoAgentState } from '../core/types';

const DEFAULT_STATE: GeoAgentState = {
  collapsed: true,
  panelWidth: 430,
  busy: false,
  providerId: 'openai-responses',
  modelId: 'gpt-5.5',
  allowCodeExecution: false,
  allowDestructiveTools: false,
  data: {},
};

export function useGeoAgentState(initialState?: Partial<GeoAgentState>) {
  const [state, setState] = useState<GeoAgentState>({
    ...DEFAULT_STATE,
    ...initialState,
  });

  const setCollapsed = useCallback((collapsed: boolean) => {
    setState((previous) => ({ ...previous, collapsed }));
  }, []);

  const setPanelWidth = useCallback((panelWidth: number) => {
    setState((previous) => ({ ...previous, panelWidth }));
  }, []);

  const setProviderId = useCallback((providerId: GeoAgentProviderId) => {
    setState((previous) => ({ ...previous, providerId }));
  }, []);

  const setModelId = useCallback((modelId: string) => {
    setState((previous) => ({ ...previous, modelId }));
  }, []);

  const setData = useCallback((data: Record<string, unknown>) => {
    setState((previous) => ({ ...previous, data: { ...previous.data, ...data } }));
  }, []);

  const reset = useCallback(() => {
    setState({ ...DEFAULT_STATE, ...initialState });
  }, [initialState]);

  const toggle = useCallback(() => {
    setState((previous) => ({ ...previous, collapsed: !previous.collapsed }));
  }, []);

  return {
    state,
    setState,
    setCollapsed,
    setPanelWidth,
    setProviderId,
    setModelId,
    setData,
    reset,
    toggle,
  };
}
