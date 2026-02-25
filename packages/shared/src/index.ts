export type UserRole = 'admin' | 'employee' | 'manager';

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  department: string;
  empId?: string | null;
  workingLocation?: string | null;
  baseLocation?: string | null;
  mobileNumber?: string | null;
  billable: boolean;
  projectAllocation: number;
  active: boolean;
  userId?: string | null;
}

export type EmployeeCreatePayload = Omit<Employee, 'id'>;
export type EmployeeUpdatePayload = Omit<Employee, 'id' | 'email'>;
export type EmployeePayload = EmployeeCreatePayload;

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
