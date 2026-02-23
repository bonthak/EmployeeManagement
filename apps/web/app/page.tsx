'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Employee, EmployeePayload, UserRole } from '@em/shared';
import { authApi, employeeApi, type SessionState, userApi } from '../lib/employee-api';
import { useEmployeeUiStore } from '../store/employee-ui-store';

const roleOptions: UserRole[] = ['admin', 'manager', 'employee'];
const sessionKey = 'emportal.session';

const emptyForm: EmployeePayload = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'employee',
  department: '',
  userId: null,
};

const loginDefaults = {
  email: 'admin@company.com',
  password: 'ChangeMe123!',
};

export default function HomePage() {
  const queryClient = useQueryClient();
  const {
    q,
    role,
    department,
    page,
    pageSize,
    setQ,
    setRole,
    setDepartment,
    setPage,
    setPageSize,
    resetFilters,
    editingEmployeeId,
    startEditing,
    clearEditing,
  } = useEmployeeUiStore();

  const [session, setSession] = useState<SessionState | null>(null);
  const [loginForm, setLoginForm] = useState(loginDefaults);
  const [loginError, setLoginError] = useState('');
  const [form, setForm] = useState<EmployeePayload>(emptyForm);
  const [formError, setFormError] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileError, setProfileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(sessionKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SessionState;
      setSession(parsed);
    } catch {
      window.localStorage.removeItem(sessionKey);
    }
  }, []);

  const filters = useMemo(() => ({ q, role, department, page, pageSize }), [q, role, department, page, pageSize]);

  const employeesQuery = useQuery({
    queryKey: ['employees', session?.token, filters],
    queryFn: () => employeeApi.list(session!.token, filters),
    enabled: Boolean(session?.token),
  });

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(loginForm),
    onSuccess: (payload) => {
      setSession(payload);
      window.localStorage.setItem(sessionKey, JSON.stringify(payload));
      setLoginError('');
    },
    onError: () => {
      setLoginError('Invalid login. Check credentials and database seed.');
    },
  });

  const createEmployee = useMutation({
    mutationFn: (payload: EmployeePayload) => employeeApi.create(session!.token, payload),
    onSuccess: async () => {
      setForm(emptyForm);
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const updateEmployee = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EmployeePayload }) =>
      employeeApi.update(session!.token, id, payload),
    onSuccess: async () => {
      clearEditing();
      setForm(emptyForm);
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: (id: string) => employeeApi.remove(session!.token, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const uploadProfileImage = useMutation({
    mutationFn: async (file: File) => {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });
      return userApi.uploadProfileImage(session!.token, imageData);
    },
    onSuccess: (user) => {
      const nextSession: SessionState = { token: session!.token, user };
      setSession(nextSession);
      window.localStorage.setItem(sessionKey, JSON.stringify(nextSession));
      setProfileError('');
    },
    onError: () => {
      setProfileError('Could not upload image. Try a smaller file.');
    },
  });

  const canEdit = session?.user.role === 'admin' || session?.user.role === 'manager';
  const canDelete = session?.user.role === 'admin';

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    if (!form.firstName || !form.lastName || !form.email || !form.department) {
      setFormError('All fields are required.');
      return;
    }

    try {
      if (editingEmployeeId) {
        await updateEmployee.mutateAsync({ id: editingEmployeeId, payload: form });
      } else {
        await createEmployee.mutateAsync(form);
      }
    } catch {
      setFormError('Failed to save employee. Check duplicate email or permissions.');
    }
  };

  const onEdit = (employee: Employee) => {
    startEditing(employee.id);
    setForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      role: employee.role,
      department: employee.department,
      userId: employee.userId ?? null,
    });
  };

  const onLogout = async () => {
    if (session?.token) {
      try {
        await authApi.logout(session.token);
      } catch {
        // Ignore logout API failures and clear local session regardless.
      }
    }
    setSession(null);
    setProfileMenuOpen(false);
    window.localStorage.removeItem(sessionKey);
    queryClient.removeQueries({ queryKey: ['employees'] });
  };

  const onProfileFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !session) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('Please choose a valid image file.');
      return;
    }

    await uploadProfileImage.mutateAsync(file);
    event.target.value = '';
  };

  const profileInitial = session?.user.email?.charAt(0).toUpperCase() ?? 'U';

  if (!session) {
    return (
      <main>
        <div className="card form" style={{ maxWidth: 460, margin: '32px auto' }}>
          <h1 style={{ margin: 0 }}>Employee Portal Login</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Default seed user: admin@company.com / ChangeMe123!
          </p>
          <input
            className="input"
            value={loginForm.email}
            onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="Email"
          />
          <input
            className="input"
            type="password"
            value={loginForm.password}
            onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Password"
          />
          {loginError ? <div className="error">{loginError}</div> : null}
          <button type="button" className="button" onClick={() => loginMutation.mutate()}>
            {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </main>
    );
  }

  const rows = employeesQuery.data?.data ?? [];

  return (
    <main>
      <div className="header">
        <div>
          <h1 style={{ margin: 0 }}>Employee Management Portal</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Logged in as {session.user.email} ({session.user.role})
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', position: 'relative' }}>
          <span className="badge">Total: {employeesQuery.data?.total ?? 0}</span>
          <button
            type="button"
            className="profileTrigger"
            aria-label="Open profile menu"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
          >
            {session.user.profileImage ? (
              <Image src={session.user.profileImage} alt="Profile" className="profileAvatarImage" width={44} height={44} />
            ) : (
              <span className="profileAvatarInitial">{profileInitial}</span>
            )}
          </button>
          {profileMenuOpen ? (
            <div className="profileMenu">
              <div className="profilePreview">
                {session.user.profileImage ? (
                  <Image
                    src={session.user.profileImage}
                    alt="Profile preview"
                    className="profilePreviewImage"
                    width={48}
                    height={48}
                  />
                ) : (
                  <div className="profilePreviewPlaceholder">{profileInitial}</div>
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>{session.user.email}</div>
                  <div className="muted">{session.user.role}</div>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onProfileFileChange} />
              {profileError ? <div className="error">{profileError}</div> : null}
              <button
                type="button"
                className="button secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadProfileImage.isPending}
              >
                {uploadProfileImage.isPending ? 'Uploading...' : 'Upload image'}
              </button>
              <button type="button" className="button danger" onClick={onLogout}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="card controls" aria-label="Search and filters">
        <input
          className="input"
          placeholder="Search by name or email"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <select className="select" value={role} onChange={(event) => setRole(event.target.value as '' | UserRole)}>
          <option value="">All roles</option>
          {roleOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Filter by department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        />
        <button type="button" className="button secondary" onClick={resetFilters}>
          Reset filters
        </button>
      </section>

      <div className="grid" style={{ marginTop: 16 }}>
        {canEdit ? (
          <section className="card">
            <form className="form" onSubmit={submitForm}>
              <h2 style={{ margin: 0 }}>{editingEmployeeId ? 'Edit Employee' : 'Add Employee'}</h2>
              <div className="formRow">
                <input
                  className="input"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                />
                <input
                  className="input"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                />
              </div>
              <div className="formRow">
                <input
                  className="input"
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                />
                <input
                  className="input"
                  placeholder="Department"
                  value={form.department}
                  onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
                />
              </div>
              <select
                className="select"
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))}
              >
                {roleOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              {formError ? <div className="error">{formError}</div> : null}
              <div className="formRow">
                <button className="button" type="submit" disabled={createEmployee.isPending || updateEmployee.isPending}>
                  {editingEmployeeId ? 'Update employee' : 'Create employee'}
                </button>
                {editingEmployeeId ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      clearEditing();
                      setForm(emptyForm);
                      setFormError('');
                    }}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        ) : null}

        <section className="card tableWrap">
          <table className="table" aria-label="Employees list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employeesQuery.isLoading ? (
                <tr>
                  <td colSpan={5}>Loading employees...</td>
                </tr>
              ) : null}
              {rows.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    {employee.firstName} {employee.lastName}
                  </td>
                  <td>{employee.email}</td>
                  <td>{employee.department}</td>
                  <td>{employee.role}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {canEdit ? (
                        <button type="button" className="button secondary" onClick={() => onEdit(employee)}>
                          Edit
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="button danger"
                          onClick={() => deleteEmployee.mutate(employee.id)}
                          disabled={deleteEmployee.isPending}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!employeesQuery.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>No employees match your filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, gap: 10 }}>
            <div className="muted">
              Page {employeesQuery.data?.page ?? page} of {employeesQuery.data?.totalPages ?? 1}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="select"
                style={{ width: 90 }}
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {[5, 10, 20].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button secondary"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setPage(page + 1)}
                disabled={page >= (employeesQuery.data?.totalPages ?? 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
