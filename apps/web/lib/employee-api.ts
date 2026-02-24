import type {
  AuthUser,
  ChangePasswordRequest,
  Employee,
  EmployeePayload,
  LoginRequest,
  LoginResponse,
  PaginatedEmployees,
  UserRole,
} from '@em/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export interface EmployeeFilters {
  q: string;
  role: '' | UserRole;
  department: string;
  page: number;
  pageSize: number;
}

const toQueryString = (filters: EmployeeFilters): string => {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.role) params.set('role', filters.role);
  if (filters.department.trim()) params.set('department', filters.department.trim());
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  return `?${params.toString()}`;
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export const authApi = {
  login: async (payload: LoginRequest): Promise<LoginResponse> => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return handleResponse<LoginResponse>(response);
  },
  logout: async (token: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<void>(response);
  },
};

const withAuthHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

export const employeeApi = {
  list: async (token: string, filters: EmployeeFilters): Promise<PaginatedEmployees> => {
    const response = await fetch(`${API_BASE}/api/employees${toQueryString(filters)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<PaginatedEmployees>(response);
  },
  create: async (token: string, payload: EmployeePayload): Promise<Employee> => {
    const response = await fetch(`${API_BASE}/api/employees`, {
      method: 'POST',
      headers: withAuthHeaders(token),
      body: JSON.stringify(payload),
    });
    return handleResponse<Employee>(response);
  },
  update: async (token: string, id: string, payload: EmployeePayload): Promise<Employee> => {
    const response = await fetch(`${API_BASE}/api/employees/${id}`, {
      method: 'PUT',
      headers: withAuthHeaders(token),
      body: JSON.stringify(payload),
    });
    return handleResponse<Employee>(response);
  },
  remove: async (token: string, id: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/employees/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<void>(response);
  },
};

export interface SessionState {
  token: string;
  user: AuthUser;
}

export const userApi = {
  uploadProfileImage: async (token: string, profileImage: string): Promise<AuthUser> => {
    const response = await fetch(`${API_BASE}/api/users/me/profile-image`, {
      method: 'PATCH',
      headers: withAuthHeaders(token),
      body: JSON.stringify({ profileImage }),
    });
    const payload = await handleResponse<{ user: AuthUser }>(response);
    return payload.user;
  },
  changePassword: async (token: string, payload: ChangePasswordRequest): Promise<void> => {
    const response = await fetch(`${API_BASE}/api/users/me/password`, {
      method: 'PATCH',
      headers: withAuthHeaders(token),
      body: JSON.stringify(payload),
    });
    return handleResponse<void>(response);
  },
};
