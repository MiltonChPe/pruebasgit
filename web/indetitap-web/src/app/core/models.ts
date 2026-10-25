export interface AuthResponse { token: string; expiresAt: string; email: string; }

export interface Me { email: string; emailVerified: boolean; hasElder: boolean; elderId: number | null; }

export type BandStatus = 'Activa' | 'Inactiva';

export interface Elder {
  elderId: number;
  fullName: string;
  birthDate: string; // yyyy-MM-dd
  bloodType: string;
  allergies: string | null;
  phoneNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bandId: number | null;
  nfcCode: string | null;
  bandStatus: BandStatus | null;
}

export interface ElderPayload {
  fullName: string;
  birthDate: string;
  bloodType: string;
  allergies: string | null;
  phoneNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export interface CreateElderPayload extends ElderPayload { nfcCode: string; claimCode: string; }

export interface DocumentItem { documentId: number; documentName: string; sizeBytes: number; createdAt: string; }

export type RequestStatus = 'Pendiente' | 'Aprobado' | 'Rechazado' | 'Expirado';

export interface AccessLog {
  requestId: string;
  requestedAt: string;
  status: RequestStatus;
  requesterName: string | null;
  requesterIp: string | null;
  approvedAt: string | null;
  accessExpiresAt: string | null;
  documents: string | null;
}

// ---------- Público (escáner) ----------
export interface Emergency {
  fullName: string;
  age: number;
  bloodType: string;
  allergies: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export interface PublicDocument { documentId: number; documentName: string; }
export interface RequestAccess { requestId: string; otpExpiresAt: string; maskedPhone: string; }
export interface FileLink { documentId: number; name: string; url: string; }
export interface FilesResponse { expiresAt: string; serverNow: string; files: FileLink[]; }
