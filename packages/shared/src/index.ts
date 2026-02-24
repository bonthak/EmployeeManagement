export type UserRole = 'admin' | 'employee' | 'manager';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  department: string;
  userId?: string | null;
}

export type EmployeePayload = Omit<Employee, 'id'>;

export interface PaginatedEmployees {
  data: Employee[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  employeeId?: string | null;
  profileImage?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export const fullName = (employee: Pick<Employee, 'firstName' | 'lastName'>): string => {
  return `${employee.firstName} ${employee.lastName}`;
};
