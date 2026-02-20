import type { UserRole } from '@em/shared';
import { create } from 'zustand';

interface EmployeeUiState {
  q: string;
  role: '' | UserRole;
  department: string;
  page: number;
  pageSize: number;
  editingEmployeeId: string | null;
  setQ: (q: string) => void;
  setRole: (role: '' | UserRole) => void;
  setDepartment: (department: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  startEditing: (id: string) => void;
  clearEditing: () => void;
  resetFilters: () => void;
}

export const useEmployeeUiStore = create<EmployeeUiState>((set) => ({
  q: '',
  role: '',
  department: '',
  page: 1,
  pageSize: 5,
  editingEmployeeId: null,
  setQ: (q) => set({ q, page: 1 }),
  setRole: (role) => set({ role, page: 1 }),
  setDepartment: (department) => set({ department, page: 1 }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
  startEditing: (editingEmployeeId) => set({ editingEmployeeId }),
  clearEditing: () => set({ editingEmployeeId: null }),
  resetFilters: () => set({ q: '', role: '', department: '', page: 1 }),
}));
