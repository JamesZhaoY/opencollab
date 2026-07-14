import { create } from 'zustand';
import type { FileItem } from '@/types';
import api from '@/services/api';

interface FileState {
  files: FileItem[];
  sharedFiles: FileItem[];
  trashedFiles: FileItem[];
  selectedFile: FileItem | null;
  loading: boolean;
  fetchFiles: () => Promise<void>;
  fetchSharedFiles: () => Promise<void>;
  fetchTrashedFiles: () => Promise<void>;
  setSelectedFile: (file: FileItem | null) => void;
  createFile: (name: string, description?: string) => Promise<FileItem>;
  uploadFile: (file: File) => Promise<FileItem>;
  uploadWordDocx: (file: File) => Promise<FileItem>;
  deleteFile: (id: number) => Promise<void>;
  restoreFile: (id: number) => Promise<void>;
  permanentDeleteFile: (id: number) => Promise<void>;
  downloadFile: (id: number, name: string) => Promise<void>;
}

export const useFileStore = create<FileState>((set) => ({
  files: [],
  sharedFiles: [],
  trashedFiles: [],
  selectedFile: null,
  loading: false,

  fetchFiles: async () => {
    set({ loading: true });
    try {
      const resp = await api.get('/files');
      set({ files: Array.isArray(resp.data) ? resp.data : [], loading: false });
    } catch (err) {
      // 401 = token expired; api interceptor handles redirect.
      // Just reset loading to avoid stuck spinner.
      set({ loading: false });
      console.error('Failed to fetch files:', err);
    }
  },

  fetchSharedFiles: async () => {
    set({ loading: true });
    try {
      const resp = await api.get('/files/shared');
      set({ sharedFiles: Array.isArray(resp.data) ? resp.data : [], loading: false });
    } catch (err) {
      set({ loading: false });
      console.error('Failed to fetch shared files:', err);
    }
  },

  setSelectedFile: (file: FileItem | null) => set({ selectedFile: file }),

  createFile: async (name: string, description?: string) => {
    const resp = await api.post('/files', null, { params: { name, description } });
    set((state) => ({ files: [...state.files, resp.data] }));
    return resp.data;
  },

  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    set((state) => ({ files: [...state.files, resp.data] }));
    return resp.data;
  },

  uploadWordDocx: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const fileItem = resp.data as FileItem;
    const arrayBuffer = await file.arrayBuffer();
    sessionStorage.setItem(`pending_docx_import:${fileItem.id}`, JSON.stringify({
      name: file.name,
      buffer: Array.from(new Uint8Array(arrayBuffer)),
    }));
    set((state) => ({ files: [...state.files, fileItem] }));
    return fileItem;
  },

  deleteFile: async (id: number) => {
    await api.delete(`/files/${id}`);
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      sharedFiles: state.sharedFiles.filter((f) => f.id !== id),
    }));
  },

  fetchTrashedFiles: async () => {
    set({ loading: true });
    try {
      const resp = await api.get('/files/trashed');
      set({ trashedFiles: Array.isArray(resp.data) ? resp.data : [], loading: false });
    } catch (err) {
      set({ loading: false });
      console.error('Failed to fetch trashed files:', err);
    }
  },

  restoreFile: async (id: number) => {
    const resp = await api.post<FileItem>(`/files/${id}/restore`);
    set((state) => ({
      trashedFiles: state.trashedFiles.filter((f) => f.id !== id),
      files: state.files.some((f) => f.id === id)
        ? state.files
        : [...state.files, resp.data],
    }));
  },

  permanentDeleteFile: async (id: number) => {
    await api.delete(`/files/${id}/permanent`);
    set((state) => ({
      trashedFiles: state.trashedFiles.filter((f) => f.id !== id),
    }));
  },

  downloadFile: async (id: number, name: string) => {
    const resp = await api.get(`/files/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([resp.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
}));
