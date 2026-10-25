import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthResponse } from './models';

const TOKEN_KEY = 'identitap.token';
const EXP_KEY = 'identitap.exp';
const EMAIL_KEY = 'identitap.email';

function read(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch { /* modo privado */ }
}

/**
 * La sesión vive en sessionStorage: se conserva al recargar la página y se borra al cerrar la pestaña.
 * (Compromiso razonable para un proyecto escolar; en producción conviene cookie HttpOnly.)
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);

  private tokenValue = read(TOKEN_KEY);
  private expiresAt = Number(read(EXP_KEY) ?? 0);
  readonly email = signal<string>(read(EMAIL_KEY) ?? '');

  get token(): string | null {
    return this.isLoggedIn() ? this.tokenValue : null;
  }

  isLoggedIn(): boolean {
    return !!this.tokenValue && Date.now() < this.expiresAt;
  }

  setSession(res: AuthResponse): void {
    this.tokenValue = res.token;
    this.expiresAt = new Date(res.expiresAt).getTime();
    this.email.set(res.email);
    write(TOKEN_KEY, res.token);
    write(EXP_KEY, String(this.expiresAt));
    write(EMAIL_KEY, res.email);
  }

  logout(redirect = true): void {
    this.tokenValue = null;
    this.expiresAt = 0;
    this.email.set('');
    write(TOKEN_KEY, null);
    write(EXP_KEY, null);
    write(EMAIL_KEY, null);
    if (redirect) this.router.navigate(['/admin/login']);
  }
}
