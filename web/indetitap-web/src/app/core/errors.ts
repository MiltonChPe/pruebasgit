import { HttpErrorResponse } from '@angular/common/http';

/** Convierte cualquier error HTTP en un mensaje en español para mostrar al usuario. */
export function errorMessage(err: unknown, fallback = 'Ocurrió un error. Intenta de nuevo.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.';
    const body = err.error;
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error;
    }
    if (err.status === 429) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
    if (err.status === 413) return 'El archivo es demasiado grande.';
  }
  return fallback;
}

export function httpStatus(err: unknown): number {
  return err instanceof HttpErrorResponse ? err.status : -1;
}
