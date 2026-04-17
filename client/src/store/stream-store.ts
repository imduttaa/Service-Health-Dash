import { create } from 'zustand';
import { ConnectionStatus } from '../lib/ws-manager';

interface StreamState {
  status: ConnectionStatus;
  reconnectAttempt: number;
  setStatus: (s: ConnectionStatus) => void;
  incrementAttempt: () => void;
  resetAttempt: () => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  status: 'disconnected',
  reconnectAttempt: 0,
  setStatus: (s) => set({ status: s }),
  incrementAttempt: () => set((state) => ({ reconnectAttempt: state.reconnectAttempt + 1 })),
  resetAttempt: () => set({ reconnectAttempt: 0 }),
}));
