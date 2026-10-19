import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitted = signal(false);
  readonly loginError = signal('');
  readonly loginMessage = signal('');
  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  onSubmit(): void {
    this.submitted.set(true);
    this.loginError.set('');
    this.loginMessage.set('');

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const { email, password } = this.loginForm.getRawValue();
    this.authService.login(email, password).subscribe({
      next: () => {
        this.loginMessage.set('Inicio de sesión correcto. Redirigiendo...');
        void this.router.navigate(['/dashboard']);
      },
      error: (error: HttpErrorResponse) => {
        this.isSubmitting.set(false);
        if (error.status === 401) {
          this.loginError.set('Correo o contraseña incorrectos');
          return;
        }

        this.loginError.set('No fue posible iniciar sesión. Inténtalo de nuevo.');
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }
}
