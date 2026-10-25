import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/errors';
import { Elder, Me } from '../core/models';
import { AlertComponent } from '../shared/alert.component';
import { ElderFormComponent } from '../shared/elder-form.component';
import { LogoComponent } from '../shared/logo.component';
import { BandPanelComponent } from './band-panel.component';
import { DocumentsPanelComponent } from './documents-panel.component';
import { LogsPanelComponent } from './logs-panel.component';

type Tab = 'docs' | 'emergency' | 'logs' | 'band';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    AlertComponent, ElderFormComponent, LogoComponent,
    DocumentsPanelComponent, LogsPanelComponent, BandPanelComponent,
  ],
  template: `
    <header class="topbar">
      <div class="container bar">
        <app-logo />
        <div class="row">
          <span class="hint user-email">{{ auth.email() }}</span>
          <button type="button" class="btn btn-secondary btn-small" (click)="logout()">Cerrar sesión</button>
        </div>
      </div>
    </header>

    <main id="contenido" class="container">
      @if (loading()) {
        <p class="center"><span class="spinner spinner-dark"></span> Cargando tu panel…</p>
      } @else if (loadError()) {
        <app-alert type="error">{{ loadError() }}</app-alert>
        <button type="button" class="btn btn-primary" (click)="load()">Reintentar</button>
      } @else if (!me()?.hasElder) {

        <!-- ================= DASHBOARD BLOQUEADO ================= -->
        <section class="card">
          <div class="lock-head">
            <span class="lock-icon" aria-hidden="true">🔒</span>
            <div>
              <h1>Registra el perfil del Adulto Mayor</h1>
              <p>Tu panel está bloqueado hasta que captures sus datos de emergencia y vincules la pulsera.</p>
            </div>
          </div>

          <div class="tabs" aria-hidden="true">
            <button class="tab" disabled>🔒 Documentos</button>
            <button class="tab" disabled>🔒 Datos de emergencia</button>
            <button class="tab" disabled>🔒 Registros de acceso</button>
            <button class="tab" disabled>🔒 Pulsera</button>
          </div>

          <app-elder-form mode="create" (saved)="load()" />
        </section>

      } @else if (elder(); as e) {

        <!-- ================= DASHBOARD LIBERADO ================= -->
        <section class="card">
          <div class="row-between">
            <div>
              <p class="hint" style="margin:0">Perfil protegido</p>
              <h1 style="margin:0">{{ e.fullName }}</h1>
            </div>
            <span class="chip" [class.chip-ok]="e.bandStatus === 'Activa'" [class.chip-off]="e.bandStatus !== 'Activa'">
              {{ e.bandStatus === 'Activa' ? '● Pulsera activa' : '○ Pulsera inactiva' }}
            </span>
          </div>
        </section>

        <div class="tabs" role="tablist" aria-label="Secciones del panel">
          <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'docs'" (click)="tab.set('docs')">📄 Documentos</button>
          <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'emergency'" (click)="tab.set('emergency')">🩸 Datos de emergencia</button>
          <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'logs'" (click)="tab.set('logs')">🕒 Registros de acceso</button>
          <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === 'band'" (click)="tab.set('band')">📡 Pulsera</button>
        </div>

        <section class="card" role="tabpanel">
          @switch (tab()) {
            @case ('docs') { <app-documents-panel /> }
            @case ('emergency') { <app-elder-form mode="edit" [elder]="e" (saved)="reloadElder()" /> }
            @case ('logs') { <app-logs-panel /> }
            @case ('band') { <app-band-panel [elder]="e" (changed)="reloadElder()" /> }
          }
        </section>
      }
    </main>
  `,
  styles: [`
    .lock-head { display: flex; gap: 1rem; align-items: flex-start; margin-bottom: .5rem; }
    .lock-icon { font-size: 2.5rem; line-height: 1; }
  `],
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  loading = signal(true);
  loadError = signal('');
  me = signal<Me | null>(null);
  elder = signal<Elder | null>(null);
  tab = signal<Tab>('docs');

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const me = await firstValueFrom(this.api.me());
      this.me.set(me);
      this.elder.set(me.hasElder ? await firstValueFrom(this.api.getElder()) : null);
    } catch (e) {
      this.loadError.set(errorMessage(e, 'No se pudo cargar tu panel.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Recarga solo el perfil (sin pantalla de carga) después de editar o cambiar la pulsera. */
  async reloadElder(): Promise<void> {
    try {
      this.elder.set(await firstValueFrom(this.api.getElder()));
    } catch (e) {
      this.loadError.set(errorMessage(e));
    }
  }

  logout(): void { this.auth.logout(); }
}
