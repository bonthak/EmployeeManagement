'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangePasswordRequest, Employee, EmployeePayload, UserRole } from '@em/shared';
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
  email: '',
  password: '',
};

const changePasswordDefaults: ChangePasswordRequest & { confirmPassword: string } = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
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
  const [hasHydrated, setHasHydrated] = useState(false);
  const [loginForm, setLoginForm] = useState(loginDefaults);
  const [loginError, setLoginError] = useState('');
  const [loginInfo, setLoginInfo] = useState('');
  const [form, setForm] = useState<EmployeePayload>(emptyForm);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [nameSortOrder, setNameSortOrder] = useState<'asc' | 'desc'>('asc');
  const [recentlyUpdatedEmployeeId, setRecentlyUpdatedEmployeeId] = useState<string | null>(null);
  const [pendingScrollEmployeeId, setPendingScrollEmployeeId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showChangePasswordScreen, setShowChangePasswordScreen] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState(changePasswordDefaults);
  const [changePasswordError, setChangePasswordError] = useState('');
  const [profileError, setProfileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profileContainerRef = useRef<HTMLDivElement | null>(null);
  const employeeFormSectionRef = useRef<HTMLElement | null>(null);

  const clearBrowserState = async () => {
    await queryClient.cancelQueries();
    queryClient.removeQueries();
    queryClient.clear();

    window.localStorage.removeItem(sessionKey);
    window.sessionStorage.clear();

    if (window.localStorage.length > 0) {
      window.localStorage.clear();
    }

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf('=');
      const name = (eqPos > -1 ? cookie.slice(0, eqPos) : cookie).trim();
      if (!name) continue;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
      document.cookie = `${name}=;max-age=0;path=/`;
    }

    if ('caches' in window) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
    }

    if ('indexedDB' in window) {
      const idb = window.indexedDB as IDBFactory & {
        databases?: () => Promise<Array<{ name?: string }>>;
      };

      if (idb.databases) {
        const databases = await idb.databases();
        await Promise.all(
          databases
            .map((db) => db.name)
            .filter((name): name is string => Boolean(name))
            .map(
              (name) =>
                new Promise<void>((resolve) => {
                  const request = window.indexedDB.deleteDatabase(name);
                  request.onsuccess = () => resolve();
                  request.onerror = () => resolve();
                  request.onblocked = () => resolve();
                }),
            ),
        );
      }
    }

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  };

  useEffect(() => {
    setHasHydrated(true);
    const raw = window.localStorage.getItem(sessionKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SessionState;
      setSession(parsed);
    } catch {
      window.localStorage.removeItem(sessionKey);
    }
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;

    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!profileContainerRef.current) return;
      const target = event.target as Node;
      if (!profileContainerRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
    };
  }, [profileMenuOpen]);

  const filters = useMemo(
    () => ({ q, role, department, page, pageSize }),
    [q, role, department, page, pageSize],
  );

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
      setLoginInfo('');
    },
    onError: () => {
      setLoginInfo('');
      setLoginError('Invalid login. Check credentials and database seed.');
    },
  });

  const createEmployee = useMutation({
    mutationFn: (payload: EmployeePayload) => employeeApi.create(session!.token, payload),
    onSuccess: async (createdEmployee) => {
      setForm(emptyForm);
      setFormError('');
      setRecentlyUpdatedEmployeeId(createdEmployee.id);
      setPendingScrollEmployeeId(createdEmployee.id);
      const createdEmployeePage = await findEmployeePage(createdEmployee.id);
      setQ('');
      setRole('');
      setDepartment('');
      setPage(createdEmployeePage ?? 1);
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });

  const updateEmployee = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EmployeePayload }) =>
      employeeApi.update(session!.token, id, payload),
    onSuccess: async (updatedEmployee) => {
      clearEditing();
      setForm(emptyForm);
      setFormError('');
      setRecentlyUpdatedEmployeeId(updatedEmployee.id);
      setPendingScrollEmployeeId(updatedEmployee.id);
      if (!canCreateEmployee) {
        setShowEmployeeForm(false);
      }
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

  const changePassword = useMutation({
    mutationFn: (payload: ChangePasswordRequest) => userApi.changePassword(session!.token, payload),
    onSuccess: async () => {
      if (session?.token) {
        try {
          await authApi.logout(session.token);
        } catch {
          // Ignore logout API failures and clear local session regardless.
        }
      }

      setSession(null);
      setProfileMenuOpen(false);
      setShowChangePasswordScreen(false);
      setChangePasswordForm(changePasswordDefaults);
      setChangePasswordError('');
      setLoginError('');
      setLoginInfo('Password changed successfully. Please sign in again.');
      await clearBrowserState();
    },
    onError: () => {
      setChangePasswordError(
        'Failed to change password. Check your current password and try again.',
      );
    },
  });

  const canEdit = session?.user.role === 'admin' || session?.user.role === 'manager';
  const canDelete = session?.user.role === 'admin';
  const isAdmin = session?.user.role === 'admin';
  const canCreateEmployee = isAdmin;
  const showPaginationControls = session?.user.role !== 'employee';

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
    setShowEmployeeForm(true);
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

  useEffect(() => {
    if (!showEmployeeForm || !employeeFormSectionRef.current) return;
    employeeFormSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showEmployeeForm, editingEmployeeId]);

  useEffect(() => {
    if (!recentlyUpdatedEmployeeId) return;
    const timer = window.setTimeout(() => setRecentlyUpdatedEmployeeId(null), 2600);
    return () => window.clearTimeout(timer);
  }, [recentlyUpdatedEmployeeId]);

  useEffect(() => {
    if (!pendingScrollEmployeeId || !employeesQuery.data) return;

    const row = document.querySelector<HTMLTableRowElement>(
      `[data-employee-id="${pendingScrollEmployeeId}"]`,
    );

    if (!row) return;

    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPendingScrollEmployeeId(null);
  }, [pendingScrollEmployeeId, employeesQuery.data]);

  const onLogout = async () => {
    if (session?.token) {
      try {
        await authApi.logout(session.token);
      } catch {
        setProfileError('Sign out failed. Please try again.');
        return;
      }
    }
    setSession(null);
    setProfileMenuOpen(false);
    setShowChangePasswordScreen(false);
    setChangePasswordForm(changePasswordDefaults);
    setChangePasswordError('');
    await clearBrowserState();
  };

  const onSubmitChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChangePasswordError('');

    if (
      !changePasswordForm.currentPassword ||
      !changePasswordForm.newPassword ||
      !changePasswordForm.confirmPassword
    ) {
      setChangePasswordError('All password fields are required.');
      return;
    }

    if (changePasswordForm.newPassword.length < 8) {
      setChangePasswordError('New password must be at least 8 characters.');
      return;
    }

    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      setChangePasswordError('New password and confirm password must match.');
      return;
    }

    if (changePasswordForm.currentPassword === changePasswordForm.newPassword) {
      setChangePasswordError('New password must be different from current password.');
      return;
    }

    await changePassword.mutateAsync({
      currentPassword: changePasswordForm.currentPassword,
      newPassword: changePasswordForm.newPassword,
    });
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
  const portalTitle = session?.user.employeeId ? 'Employee Portal' : 'Employee Management Portal';
  const headerTitle = session ? portalTitle : 'Employee Portal';
  const hasEmployeeRecord = Boolean(session?.user.employeeId);

  const findEmployeePage = async (employeeId: string): Promise<number | null> => {
    if (!session?.token) return null;

    const firstPage = await employeeApi.list(session.token, {
      q: '',
      role: '',
      department: '',
      page: 1,
      pageSize,
    });

    if (firstPage.data.some((item) => item.id === employeeId)) {
      return 1;
    }

    for (let currentPage = 2; currentPage <= firstPage.totalPages; currentPage += 1) {
      const response = await employeeApi.list(session.token, {
        q: '',
        role: '',
        department: '',
        page: currentPage,
        pageSize,
      });

      if (response.data.some((item) => item.id === employeeId)) {
        return currentPage;
      }
    }

    return null;
  };

  const rows = useMemo(() => {
    const baseRows = employeesQuery.data?.data ?? [];
    return [...baseRows].sort((a, b) => {
      const left = `${a.firstName} ${a.lastName}`.trim().toLowerCase();
      const right = `${b.firstName} ${b.lastName}`.trim().toLowerCase();
      const compared = left.localeCompare(right);
      return nameSortOrder === 'asc' ? compared : -compared;
    });
  }, [employeesQuery.data?.data, nameSortOrder]);

  const bodyContent = !hasHydrated ? (
    <div className="card form appBodyCard">
      <h1 style={{ margin: 0 }}>Employee Portal</h1>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        Loading...
      </p>
    </div>
  ) : !session ? (
    <div className="card form appBodyCard">
      <div className="authIllustration authIllustrationSignIn" aria-hidden="true">
        <Image src="/art/login-hero.svg" alt="" width={640} height={320} priority />
      </div>
      <h1 style={{ margin: 0 }}>Employee Portal Signin</h1>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        Use seeded credentials configured for this environment.
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
      {loginInfo ? <div className="muted">{loginInfo}</div> : null}
      {loginError ? <div className="error">{loginError}</div> : null}
      <button type="button" className="button" onClick={() => loginMutation.mutate()}>
        {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
      </button>
    </div>
  ) : showChangePasswordScreen ? (
    <div className="card form appBodyCard appBodyWide">
      <div className="authIllustration" aria-hidden="true">
        <Image src="/art/login-hero.svg" alt="" width={640} height={320} />
      </div>
      <h1 style={{ margin: 0 }}>Change Password</h1>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        Update your password to continue using the portal.
      </p>
      <form className="form" style={{ padding: 0 }} onSubmit={onSubmitChangePassword}>
        <input
          className="input"
          type="password"
          placeholder="Current password"
          value={changePasswordForm.currentPassword}
          onChange={(event) =>
            setChangePasswordForm((prev) => ({
              ...prev,
              currentPassword: event.target.value,
            }))
          }
        />
        <input
          className="input"
          type="password"
          placeholder="New password"
          value={changePasswordForm.newPassword}
          onChange={(event) =>
            setChangePasswordForm((prev) => ({
              ...prev,
              newPassword: event.target.value,
            }))
          }
        />
        <input
          className="input"
          type="password"
          placeholder="Confirm new password"
          value={changePasswordForm.confirmPassword}
          onChange={(event) =>
            setChangePasswordForm((prev) => ({
              ...prev,
              confirmPassword: event.target.value,
            }))
          }
        />
        {changePasswordError ? <div className="error">{changePasswordError}</div> : null}
        <div className="formRow">
          <button type="submit" className="button" disabled={changePassword.isPending}>
            {changePassword.isPending ? 'Updating...' : 'Update password'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setShowChangePasswordScreen(false);
              setChangePasswordError('');
            }}
          >
            Back
          </button>
        </div>
      </form>
    </div>
  ) : (
    <>
      <section className="card controls" aria-label="Search and filters">
        <input
          className="input"
          placeholder="Search by name or email"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <select
          className="select"
          value={role}
          onChange={(event) => setRole(event.target.value as '' | UserRole)}
        >
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
        {canEdit && showEmployeeForm && (canCreateEmployee || Boolean(editingEmployeeId)) ? (
          <section ref={employeeFormSectionRef} className="card">
            <form className="form" onSubmit={submitForm}>
              <h2 style={{ margin: 0 }}>{editingEmployeeId ? 'Edit Employee' : 'Add Employee'}</h2>
              <div className="formRow">
                <input
                  className="input"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                />
                <input
                  className="input"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, lastName: event.target.value }))
                  }
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
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, department: event.target.value }))
                  }
                />
              </div>
              <select
                className="select"
                value={form.role}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, role: event.target.value as UserRole }))
                }
              >
                {roleOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              {formError ? <div className="error">{formError}</div> : null}
              <div className="formRow">
                <button
                  className="button"
                  type="submit"
                  disabled={createEmployee.isPending || updateEmployee.isPending}
                >
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
                      setShowEmployeeForm(false);
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
                <th>
                  <div className="tableHeadSort">
                    <button
                      type="button"
                      className={`sortIconButton ${nameSortOrder === 'desc' ? 'active' : ''}`}
                      aria-label="Sort name descending"
                      onClick={() => setNameSortOrder('desc')}
                    >
                      <Image src="/art/sort-desc.svg" alt="" width={14} height={14} />
                    </button>
                    <span>Name</span>
                    <button
                      type="button"
                      className={`sortIconButton ${nameSortOrder === 'asc' ? 'active' : ''}`}
                      aria-label="Sort name ascending"
                      onClick={() => setNameSortOrder('asc')}
                    >
                      <Image src="/art/sort-asc.svg" alt="" width={14} height={14} />
                    </button>
                  </div>
                </th>
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
                <tr
                  key={employee.id}
                  data-employee-id={employee.id}
                  className={employee.id === recentlyUpdatedEmployeeId ? 'rowUpdated' : undefined}
                >
                  <td>
                    {employee.firstName} {employee.lastName}
                  </td>
                  <td>{employee.email}</td>
                  <td>{employee.department}</td>
                  <td>{employee.role}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => onEdit(employee)}
                        >
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
                  <td colSpan={5}>
                    <div className="emptyState">
                      <Image
                        src="/art/empty-employees.svg"
                        alt="No matching employees"
                        width={340}
                        height={220}
                        className="emptyStateImage"
                      />
                      <div>No employees match your filter.</div>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {showPaginationControls ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 12,
                gap: 10,
              }}
            >
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
          ) : null}
        </section>
      </div>
    </>
  );

  return (
    <main>
      <div className="appShell">
        <header className="card appHeader">
          <div>
            <h1 style={{ margin: 0 }}>{headerTitle}</h1>
            {session ? (
              <p className="muted" style={{ marginTop: 8 }}>
                Logged in as {session.user.email} ({session.user.role})
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>
                Sign in to access your employee workspace.
              </p>
            )}
          </div>
          {session ? (
            <div className="appHeaderActions" ref={profileContainerRef}>
              <span className="badge">Total: {employeesQuery.data?.total ?? 0}</span>
              <button
                type="button"
                className="profileTrigger"
                aria-label="Open profile menu"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
              >
                {session.user.profileImage ? (
                  <Image
                    src={session.user.profileImage}
                    alt="Profile"
                    className="profileAvatarImage"
                    width={44}
                    height={44}
                  />
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
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={onProfileFileChange}
                  />
                  {hasEmployeeRecord ? (
                    <>
                      {profileError ? <div className="error">{profileError}</div> : null}
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadProfileImage.isPending}
                      >
                        {uploadProfileImage.isPending ? 'Uploading...' : 'Upload image'}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setShowChangePasswordScreen(true);
                      setChangePasswordForm(changePasswordDefaults);
                      setChangePasswordError('');
                    }}
                  >
                    Change password
                  </button>
                  <button type="button" className="button danger" onClick={onLogout}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="appLayout">
          <aside className="card appNav">
            <h3 style={{ margin: 0 }}>Navigation</h3>
            {session ? (
              <div className="navMenu" style={{ marginTop: 10 }}>
                {isAdmin ? (
                  <button
                    type="button"
                    className="navItem"
                    onClick={() => {
                      setShowChangePasswordScreen(false);
                      setShowEmployeeForm(true);
                      clearEditing();
                      setForm(emptyForm);
                      setFormError('');
                    }}
                  >
                    Create Employee
                  </button>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    No admin menus available.
                  </p>
                )}
              </div>
            ) : (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                Sign in to view menus.
              </p>
            )}
          </aside>
          <section className="appBody">
            <div className="appBodyContent">{bodyContent}</div>
          </section>
        </div>
        <footer className="card appFooter">
          <div>
            <div className="appLogoMark" aria-hidden="true">
              EM
            </div>
            <strong>EmPortal 2.0</strong>
          </div>
          <p className="muted">
            Trademark: Edvenswa Employee Management Portal. Product log: Unified web and mobile
            workforce operations.
          </p>
        </footer>
      </div>
    </main>
  );
}
