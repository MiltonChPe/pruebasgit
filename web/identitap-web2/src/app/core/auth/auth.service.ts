import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

interface LoginResponse {
  token: string;
}

interface TokenClaims {
  name?: unknown;
  nombre?: unknown;
  given_name?: unknown;
  unique_name?: unknown;
  email?: unknown;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenKey = 'token';

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap((response) => localStorage.setItem(this.tokenKey, response.token)));
  }

  estaLogueado(): boolean {
    return Boolean(localStorage.getItem(this.tokenKey));
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    void this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getUserName(): string {
    const token = this.getToken();
    if (!token) {
      return 'familia';
    }

    const payload = token.split('.')[1];
    if (!payload) {
      return 'familia';
    }

    try {
      const claims = JSON.parse(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
      ) as TokenClaims;
      const nameClaim = [claims.name, claims.nombre, claims.given_name, claims.unique_name, claims.email]
        .find((claim): claim is string => typeof claim === 'string' && claim.trim().length > 0);

      return nameClaim ?? 'familia';
    } catch {
      return 'familia';
    }
  }
}
