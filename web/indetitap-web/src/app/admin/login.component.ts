import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage, httpStatus } from '../core/errors';
import { AlertComponent } from '../shared/alert.component';
import { LogoComponent } from '../shared/logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, LogoComponent],
  template: `
    <main id="contenido" class="page-center">
      <section class="card narrow">
        <app-logo />
        <h1>Iniciar sesión</h1>
        <p class="hint">Administra la información médica y los documentos de tu familiar.</p>

        @if (error()) { <app-alert type="error">{{ error() }}</app-alert> }
        @if (info()) { <app-alert type="success">{{ info() }}</app-alert> }

        @if (needsVerify()) {
          <button type="button" class="btn btn-secondary btn-block" style="margin-bottom:1rem"
                  (click)="resend()" [disabled]="busy()">Reenviar correo de confirmación</button>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="email">Correo electrónico</label>
            <input id="email" type="email" formControlName="email" autocomplete="email" inputmode="email" />
            @if (bad('email')) { <p class="error-text">Escribe un correo válido.</p> }
          </div>

          <div class="field">
            <label for="password">Contraseña</label>
            <div class="input-group">
              <input id="password" [type]="showPwd() ? 'text' : 'password'" formControlName="password"
                     autocomplete="current-password" />
              <button type="button" class="btn btn-secondary btn-small" (click)="showPwd.set(!showPwd())"
                      [attr.aria-pressed]="showPwd()">{{ showPwd() ? 'Ocultar' : 'Mostrar' }}</button>
            </div>
            @if (bad('password')) { <p class="error-text">Escribe tu contraseña.</p> }
          </div>

          <button class="btn btn-primary btn-block" type="submit" [disabled]="busy()">
            @if (busy()) { <span class="spinner"></span> Entrando… } @else { Entrar }
          </button>
        </form>

        <p class="center" style="margin:1.25rem 0 0">
          ¿Aún no tienes cuenta? <a routerLink="/admin/register">Crear cuenta</a>
        </p>
      </section>
    </main>
  `,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  busy = signal(false);
  error = signal('');
  info = signal('');
  showPwd = signal(false);
  needsVerify = signal(false);
  private submitted = false;

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  bad(name: 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted);
  }

  async submit(): Promise<void> {
    this.submitted = true;
    this.error.set('');
    this.info.set('');
    this.needsVerify.set(false);

    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const { email, password } = this.form.getRawValue();
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.login(email.trim(), password));
      this.auth.setSession(res);
      await this.router.navigate(['/admin/dashboard']);
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudo iniciar sesión.'));
      this.needsVerify.set(httpStatus(e) === 403);
    } finally {
      this.busy.set(false);
    }
  }

  async resend(): Promise<void> {
    const email = this.form.controls.email.value.trim();
    if (!email) { this.error.set('Escribe tu correo para reenviar el enlace.'); return; }
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.resendVerification(email));
      this.error.set('');
      this.info.set(res.message);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
