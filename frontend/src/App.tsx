import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import LoginPage from '@/pages/Login';
import FileListPage from '@/pages/FileList';
import FileEditorPage from '@/pages/FileEditor';
import AdminUsersPage from '@/pages/AdminUsers';
import ChangePasswordPage from '@/pages/ChangePassword';
import AuthRedirectHandler from '@/components/AuthRedirectHandler';
import UserDock from '@/components/UserDock';
import AiAssistant from '@/components/AiAssistant';

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
          element={isAuthenticated ? <FileEditorPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/settings/password"
          element={isAuthenticated ? <ChangePasswordPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/admin/users"
          element={
            isAuthenticated
              ? user
                ? user.role === 'admin'
                  ? <AdminUsersPage />
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
