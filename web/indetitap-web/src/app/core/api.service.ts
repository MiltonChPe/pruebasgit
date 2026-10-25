import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from './config';
import {
  AccessLog, AuthResponse, BandStatus, CreateElderPayload, DocumentItem, Elder, ElderPayload,
  Emergency, FilesResponse, Me, PublicDocument, RequestAccess,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private u = (path: string) => `${API_URL}${path}`;

  // ------------------------------ Auth ------------------------------
  register(email: string, password: string) {
    return this.http.post<{ message: string }>(this.u('/auth/register'), { email, password });
  }
  verifyEmail(token: string) {
    return this.http.post<{ message: string }>(this.u('/auth/verify-email'), { token });
  }
  resendVerification(email: string) {
    return this.http.post<{ message: string }>(this.u('/auth/resend-verification'), { email });
  }
  login(email: string, password: string) {
    return this.http.post<AuthResponse>(this.u('/auth/login'), { email, password });
  }

  // ------------------------------ Admin ------------------------------
  me() { return this.http.get<Me>(this.u('/admin/me')); }

  getElder() { return this.http.get<Elder>(this.u('/admin/elder')); }
  createElder(payload: CreateElderPayload) {
    return this.http.post<{ elderId: number; bandId: number }>(this.u('/admin/elder'), payload);
  }
  updateElder(payload: ElderPayload) { return this.http.put<void>(this.u('/admin/elder'), payload); }

  setBandStatus(status: BandStatus) {
    const action = status === 'Activa' ? 'activate' : 'deactivate';
    return this.http.post<{ status: BandStatus }>(this.u(`/admin/band/${action}`), {});
  }
  unlinkBand() { return this.http.post<void>(this.u('/admin/band/unlink'), {}); }
  linkBand(nfcCode: string, claimCode: string) {
    return this.http.post<{ bandId: number }>(this.u('/admin/band/link'), { nfcCode, claimCode });
  }

  getDocuments() { return this.http.get<DocumentItem[]>(this.u('/admin/documents')); }
  uploadDocument(file: File, name: string) {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    return this.http.post<{ documentId: number }>(this.u('/admin/documents'), form);
  }
  renameDocument(id: number, documentName: string) {
    return this.http.put<void>(this.u(`/admin/documents/${id}`), { documentName });
  }
  replaceDocumentFile(id: number, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<void>(this.u(`/admin/documents/${id}/file`), form);
  }
  deleteDocument(id: number) { return this.http.delete<void>(this.u(`/admin/documents/${id}`)); }

  getAccessLogs() { return this.http.get<AccessLog[]>(this.u('/admin/access-logs')); }

  // ------------------------------ Público (escáner) ------------------------------
  emergency(code: string) {
    return this.http.get<Emergency>(this.u(`/scan/${encodeURIComponent(code)}/emergency`));
  }
  publicDocuments(code: string) {
    return this.http.get<PublicDocument[]>(this.u(`/scan/${encodeURIComponent(code)}/documents`));
  }
  requestAccess(code: string, documentIds: number[], requesterName: string | null) {
    return this.http.post<RequestAccess>(this.u(`/scan/${encodeURIComponent(code)}/request`), {
      documentIds,
      requesterName,
    });
  }
  verifyOtp(requestId: string, code: string) {
    return this.http.post<FilesResponse>(this.u('/access/verify-otp'), { requestId, code });
  }
  getFiles(requestId: string) {
    return this.http.get<FilesResponse>(this.u(`/access/${requestId}/files`));
  }
}
