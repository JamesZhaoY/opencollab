import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import LoginPage from '@/pages/Login';
import FileListPage from '@/pages/FileList';
import AuthRedirectHandler from '@/components/AuthRedirectHandler';
import UserDock from '@/components/UserDock';
import AiAssistant from '@/components/AiAssistant';

const FileEditorPage = lazy(() => import('@/pages/FileEditor'));
const AdminUsersPage = lazy(() => import('@/pages/AdminUsers'));
const ChangePasswordPage = lazy(() => import('@/pages/ChangePassword'));

function RouteLoading({ label = '正在加载页面...' }: { label?: string }) {
  return <div className="route-loading">{label}</div>;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const loadCurrentUser = useAuthStore((s) => s.loadCurrentUser);

  useEffect(() => {
    if (isAuthenticated) {
      loadCurrentUser();
    }
  }, [isAuthenticated, loadCurrentUser]);

  return (
    <>
      <div id="auth-token-expired" style={{ display: 'none' }} />
      <AuthRedirectHandler />
      <UserDock />
      <AiAssistant />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/files"
          element={isAuthenticated ? <FileListPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/editor/:fileId"
          element={isAuthenticated ? (
            <Suspense fallback={<RouteLoading label="正在加载编辑器..." />}>
              <FileEditorPage />
            </Suspense>
          ) : <Navigate to="/login" />}
        />
        <Route
          path="/settings/password"
          element={isAuthenticated ? (
            <Suspense fallback={<RouteLoading />}><ChangePasswordPage /></Suspense>
          ) : <Navigate to="/login" />}
        />
        <Route
          path="/admin/users"
          element={
            isAuthenticated
              ? user
                ? user.role === 'admin'
                  ? <Suspense fallback={<RouteLoading />}><AdminUsersPage /></Suspense>
                  : <Navigate to="/files" />
                : <div className="route-loading">正在加载账号信息...</div>
              : <Navigate to="/login" />
          }
        />
        <Route path="*" element={<Navigate to="/files" />} />
      </Routes>
    </>
  );
}
