import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/errors';
import { AlertComponent } from '../shared/alert.component';
import { LogoComponent } from '../shared/logo.component';

function sameAs(group: AbstractControl): ValidationErrors | null {
  const pwd = group.get('password')?.value;
  const confirm = group.get('confirm')?.value;
  return pwd === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, LogoComponent],
  template: `
    <main id="contenido" class="page-center">
      <section class="card narrow">
        <app-logo />

        @if (!done()) {
          <h1>Crear cuenta</h1>
          <p class="hint">Te enviaremos un correo para confirmar tu cuenta.</p>

          @if (error()) { <app-alert type="error">{{ error() }}</app-alert> }

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
                       autocomplete="new-password" />
                <button type="button" class="btn btn-secondary btn-small" (click)="showPwd.set(!showPwd())"
                        [attr.aria-pressed]="showPwd()">{{ showPwd() ? 'Ocultar' : 'Mostrar' }}</button>
              </div>
              <p class="hint">Mínimo 8 caracteres.</p>
              @if (bad('password')) { <p class="error-text">La contraseña debe tener al menos 8 caracteres.</p> }
            </div>

            <div class="field">
              <label for="confirm">Repite la contraseña</label>
              <input id="confirm" [type]="showPwd() ? 'text' : 'password'" formControlName="confirm"
                     autocomplete="new-password" />
              @if (submitted && form.hasError('mismatch')) { <p class="error-text">Las contraseñas no coinciden.</p> }
            </div>

            <button class="btn btn-primary btn-block" type="submit" [disabled]="busy()">
              @if (busy()) { <span class="spinner"></span> Creando cuenta… } @else { Crear cuenta }
            </button>
          </form>

          <p class="center" style="margin:1.25rem 0 0">
            ¿Ya tienes cuenta? <a routerLink="/admin/login">Iniciar sesión</a>
          </p>
        } @else {
          <h1>Revisa tu correo</h1>
          <app-alert type="success">
            Enviamos un enlace de confirmación a <strong>{{ sentTo() }}</strong>. Ábrelo para activar tu cuenta.
          </app-alert>
          <p class="hint">Si no lo ves, revisa la carpeta de spam. El enlace vence en 24 horas.</p>
          @if (info()) { <app-alert type="info">{{ info() }}</app-alert> }
          @if (error()) { <app-alert type="error">{{ error() }}</app-alert> }
          <button type="button" class="btn btn-secondary btn-block" (click)="resend()" [disabled]="busy()">
            Reenviar correo
          </button>
          <p class="center" style="margin:1.25rem 0 0"><a routerLink="/admin/login">Ir a iniciar sesión</a></p>
        }
      </section>
    </main>
  `,
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);

  busy = signal(false);
  error = signal('');
  info = signal('');
  done = signal(false);
  sentTo = signal('');
  showPwd = signal(false);
  submitted = false;

  form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required],
    },
    { validators: sameAs },
  );

  bad(name: 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted);
  }

  async submit(): Promise<void> {
    this.submitted = true;
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const { email, password } = this.form.getRawValue();
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.register(email.trim(), password));
      this.sentTo.set(email.trim());
      this.done.set(true);
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudo crear la cuenta.'));
    } finally {
      this.busy.set(false);
    }
  }

  async resend(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.api.resendVerification(this.sentTo()));
      this.info.set(res.message);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
