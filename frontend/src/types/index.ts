export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  department: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FileItem {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  document_type: 'excel' | 'markdown' | 'word' | string;
  last_modified_by: number | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  sheet_data?: string | null;
  current_permission?: 'owner' | 'edit' | 'view' | string | null;
}

export interface Permission {
  id: number;
  file_id: number;
  user_id: number;
  username?: string;
  permission: 'view' | 'edit';
  granted_by: number;
  created_at: string;
}

export interface Comment {
  id: number;
  file_id: number;
  user_id: number;
  cell_ref: string | null;
  content: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
