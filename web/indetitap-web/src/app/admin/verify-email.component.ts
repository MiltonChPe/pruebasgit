import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/errors';
import { AlertComponent } from '../shared/alert.component';
import { LogoComponent } from '../shared/logo.component';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [RouterLink, AlertComponent, LogoComponent],
  template: `
    <main id="contenido" class="page-center">
      <section class="card narrow center">
        <app-logo />
        @switch (state()) {
          @case ('loading') {
            <h1>Confirmando tu correo…</h1>
            <p><span class="spinner spinner-dark"></span></p>
          }
          @case ('ok') {
            <h1>¡Correo confirmado!</h1>
            <app-alert type="success">Tu cuenta ya está activa.</app-alert>
            <a class="btn btn-primary btn-block" routerLink="/admin/login">Iniciar sesión</a>
          }
          @case ('error') {
            <h1>No se pudo confirmar</h1>
            <app-alert type="error">{{ message() }}</app-alert>
            <p class="hint">Si el enlace ya se usó, intenta iniciar sesión. Si venció, pide uno nuevo desde el inicio de sesión.</p>
            <a class="btn btn-secondary btn-block" routerLink="/admin/login">Ir a iniciar sesión</a>
          }
        }
      </section>
    </main>
  `,
})
export class VerifyEmailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  state = signal<'loading' | 'ok' | 'error'>('loading');
  message = signal('');

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.message.set('El enlace no es válido: falta el código de confirmación.');
      this.state.set('error');
      return;
    }
    try {
      await firstValueFrom(this.api.verifyEmail(token));
      this.state.set('ok');
    } catch (e) {
      this.message.set(errorMessage(e, 'El enlace no es válido o expiró.'));
      this.state.set('error');
    }
  }
}
