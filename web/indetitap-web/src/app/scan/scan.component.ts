import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage, httpStatus } from '../core/errors';
import { formatClock, storageGet, storageRemove, storageSet } from '../core/format';
import { Emergency, FileLink, FilesResponse, PublicDocument, RequestAccess } from '../core/models';
import { AlertComponent } from '../shared/alert.component';
import { LogoComponent } from '../shared/logo.component';

type View = 'loading' | 'unavailable' | 'menu' | 'emergency' | 'docs' | 'otp' | 'files' | 'expired';

/**
 * Web 2 - Escáner público (/scan/:code). Sin login, pensada para paramédicos con prisa:
 * botones grandes, un solo objetivo por pantalla y datos de emergencia sin fricción.
 */
@Component({
  selector: 'app-scan',
  standalone: true,
  imports: [ReactiveFormsModule, AlertComponent, LogoComponent],
  template: `
    <header class="scan-top">
      <div class="container"><app-logo /></div>
    </header>

    <main id="contenido" class="container narrow-scan">

      @switch (view()) {

        <!-- ================= CARGANDO ================= -->
        @case ('loading') {
          <section class="card center">
            <p><span class="spinner spinner-dark"></span></p>
            <p>Leyendo pulsera…</p>
          </section>
        }

        <!-- ================= NO DISPONIBLE ================= -->
        @case ('unavailable') {
          <section class="card center">
            <h1>Pulsera no disponible</h1>
            <app-alert type="error">{{ fatal() }}</app-alert>
            <p class="hint">Puede estar desactivada por su dueño o el código no existe.</p>
            @if (canRetry()) {
              <button type="button" class="btn btn-primary btn-block" (click)="loadEmergency()">Reintentar</button>
            }
          </section>
        }

        <!-- ================= MENÚ INICIAL ================= -->
        @case ('menu') {
          <section class="stack">
            <h1 class="center">¿Qué necesitas consultar?</h1>

            <button type="button" class="menu-btn menu-red" (click)="view.set('emergency')">
              <span class="menu-icon" aria-hidden="true">🚑</span>
              <span>
                <span class="menu-title">Datos de Emergencia</span>
                <span class="menu-sub">Sangre, alergias y contacto · al instante</span>
              </span>
            </button>

            <button type="button" class="menu-btn menu-blue" (click)="openDocs()">
              <span class="menu-icon" aria-hidden="true">📄</span>
              <span>
                <span class="menu-title">Documentos</span>
                <span class="menu-sub">Requiere autorización por código SMS</span>
              </span>
            </button>
          </section>
        }

        <!-- ================= DATOS DE EMERGENCIA ================= -->
        @case ('emergency') {
          @if (emergency(); as e) {
            <section class="stack">
              <button type="button" class="btn btn-secondary" (click)="view.set('menu')">← Volver</button>

              <div class="card">
                <p class="hint" style="margin:0">Paciente</p>
                <h1 style="margin:0">{{ e.fullName }}</h1>
                <p style="margin:0">{{ e.age }} años</p>
              </div>

              <div class="blood">
                <span class="blood-label">Tipo de sangre</span>
                <span class="blood-value">{{ e.bloodType }}</span>
              </div>

              <div class="card" [class.allergy-alert]="!!e.allergies">
                <h2>⚠ Alergias</h2>
                @if (e.allergies) {
                  <p class="big">{{ e.allergies }}</p>
                } @else {
                  <p class="big">Sin alergias registradas</p>
                }
              </div>

              <div class="card">
                <h2>Contacto de emergencia</h2>
                <p class="big" style="margin-bottom:.25rem">{{ e.emergencyContactName }}</p>
                <p class="hint">{{ e.emergencyContactPhone }}</p>
                <a class="btn btn-success btn-block" [href]="'tel:' + e.emergencyContactPhone">
                  📞 Llamar ahora
                </a>
              </div>
            </section>
          }
        }

        <!-- ================= SELECCIÓN DE DOCUMENTOS ================= -->
        @case ('docs') {
          <section class="stack">
            <button type="button" class="btn btn-secondary" (click)="view.set('menu')">← Volver</button>
            <h1>Documentos disponibles</h1>

            @if (loadingDocs()) {
              <p class="center"><span class="spinner spinner-dark"></span> Cargando…</p>
            } @else if (docs().length === 0) {
              <app-alert type="info">El adulto mayor no tiene documentos cargados.</app-alert>
            } @else {
              <p class="hint">Marca los que necesitas. Se enviará un código por SMS al celular del adulto mayor.</p>

              @if (error()) { <app-alert type="error">{{ error() }}</app-alert> }

              <div role="group" aria-label="Documentos">
                @for (d of docs(); track d.documentId) {
                  <label class="doc-check" [class.checked]="isSelected(d.documentId)">
                    <input type="checkbox" [checked]="isSelected(d.documentId)" (change)="toggle(d.documentId)" />
                    <span>📄 {{ d.documentName }}</span>
                  </label>
                }
              </div>

              <div class="field">
                <label for="who">Tu nombre o institución <span class="hint">(opcional)</span></label>
                <input id="who" type="text" [formControl]="requester" maxlength="100"
                       placeholder="Ej. Cruz Roja · Paramédico Pérez" autocomplete="off" />
                <p class="hint">Queda en el registro que ve la familia.</p>
              </div>

              <button type="button" class="btn btn-primary btn-block" (click)="requestDocs()"
                      [disabled]="busy() || selected().length === 0">
                @if (busy()) { <span class="spinner"></span> Enviando código… }
                @else { Solicitar documentos ({{ selected().length }}) }
              </button>
            }
          </section>
        }

        <!-- ================= CÓDIGO OTP ================= -->
        @case ('otp') {
          <section class="stack">
            <h1>Ingresa el código</h1>
            <app-alert type="info">
              Enviamos un SMS al celular <strong>{{ request()?.maskedPhone }}</strong>.
              Pide al adulto mayor que te dicte o te muestre el código de 6 dígitos.
            </app-alert>

            @if (error()) { <app-alert type="error">{{ error() }}</app-alert> }

            <div class="field">
              <label for="otp">Código de 6 dígitos</label>
              <input id="otp" type="text" class="otp-input" [formControl]="otp" inputmode="numeric"
                     autocomplete="one-time-code" maxlength="6" placeholder="••••••" (keyup.enter)="verify()" />
            </div>

            <p class="hint center" role="timer">
              @if (otpSeconds() > 0) { El código vence en <strong>{{ clock(otpSeconds()) }}</strong> }
              @else { El código venció. Pide uno nuevo. }
            </p>

            <button type="button" class="btn btn-primary btn-block" (click)="verify()"
                    [disabled]="busy() || otp.invalid || otpSeconds() <= 0">
              @if (busy()) { <span class="spinner"></span> Verificando… } @else { Verificar código }
            </button>

            <div class="row" style="justify-content:center">
              <button type="button" class="btn-link" (click)="resendOtp()" [disabled]="busy()">Enviar otro código</button>
              <button type="button" class="btn-link" (click)="backToDocs()">Cambiar documentos</button>
            </div>
          </section>
        }

        <!-- ================= DESCARGA EFÍMERA ================= -->
        @case ('files') {
          <section class="stack">
            <div class="timer-card" [class.timer-low]="remaining() <= 60" role="timer">
              <span class="timer-label">El acceso termina en</span>
              <span class="timer-value">{{ clock(remaining()) }}</span>
              <div class="bar" aria-hidden="true"><div class="bar-fill" [style.width.%]="percent()"></div></div>
            </div>

            <app-alert type="success">Código correcto. Descarga ahora los documentos autorizados.</app-alert>

            @for (f of files(); track f.documentId) {
              <a class="btn btn-success btn-block file-btn" [href]="f.url" target="_blank" rel="noopener noreferrer">
                ⬇ Descargar: {{ f.name }}
              </a>
            }

            <p class="hint">Los enlaces dejan de funcionar cuando el contador llega a cero.</p>
            <button type="button" class="btn btn-secondary btn-block" (click)="closeAccess()">Terminar y borrar enlaces</button>
          </section>
        }

        <!-- ================= EXPIRADO ================= -->
        @case ('expired') {
          <section class="card center stack">
            <h1>El acceso terminó</h1>
            <app-alert type="info">Por seguridad, los enlaces expiran a los 3 minutos y ya no están disponibles.</app-alert>
            <button type="button" class="btn btn-primary btn-block" (click)="openDocs()">Solicitar documentos de nuevo</button>
            <button type="button" class="btn btn-secondary btn-block" (click)="view.set('menu')">Volver al inicio</button>
          </section>
        }
      }
    </main>
  `,
  styles: [`
    .scan-top { background: #fff; border-bottom: 1px solid var(--border); }
    .scan-top .container { padding-bottom: 0; }
    .narrow-scan { max-width: 560px; padding-top: 1.25rem; padding-bottom: 3rem; }

    .menu-btn {
      display: flex; align-items: center; gap: 1rem; width: 100%; min-height: 7rem; padding: 1.25rem;
      font: inherit; text-align: left; color: #fff; border: 0; border-radius: 18px; cursor: pointer;
      box-shadow: var(--shadow);
    }
    .menu-red { background: #B42318; }
    .menu-blue { background: var(--navy); }
    .menu-btn:hover { filter: brightness(1.12); }
    .menu-icon { font-size: 2.6rem; line-height: 1; }
    .menu-title { display: block; font-size: 1.5rem; font-weight: 800; }
    .menu-sub { display: block; font-size: .95rem; opacity: .95; }

    .blood {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      background: var(--navy); color: #fff; border-radius: var(--radius); padding: 1rem 1.5rem;
    }
    .blood-label { font-size: 1.1rem; font-weight: 700; }
    .blood-value { font-size: 3.2rem; font-weight: 900; line-height: 1; }

    .allergy-alert { border: 3px solid var(--danger); background: var(--danger-bg); }
    .allergy-alert h2 { color: var(--danger); }
    .big { font-size: 1.3rem; font-weight: 700; color: var(--navy); margin-bottom: .75rem; }

    .doc-check {
      display: flex; align-items: center; gap: 1rem; min-height: 4rem; padding: .9rem 1rem; margin: 0 0 .6rem;
      background: #fff; border: 2px solid var(--border); border-radius: 12px; cursor: pointer; font-weight: 600;
      color: var(--slate);
    }
    .doc-check.checked { border-color: var(--navy); background: var(--ice); }

    .otp-input { font-size: 2.2rem; text-align: center; letter-spacing: .6rem; font-weight: 800; color: var(--navy); }

    .timer-card {
      background: var(--navy); color: #fff; border-radius: var(--radius); padding: 1.25rem; text-align: center;
    }
    .timer-low { background: var(--danger); }
    .timer-label { display: block; font-size: 1rem; font-weight: 700; }
    .timer-value { display: block; font-size: 3.6rem; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.1; }
    .bar { height: 10px; background: rgba(255,255,255,.3); border-radius: 999px; margin-top: .75rem; overflow: hidden; }
    .bar-fill { height: 100%; background: #fff; transition: width .25s linear; }

    .file-btn { min-height: 4rem; font-size: 1.05rem; }
  `],
})
export class ScanComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  readonly code = this.route.snapshot.paramMap.get('code') ?? '';
  private readonly storageKey = `identitap.req.${this.code}`;
  readonly clock = formatClock;

  view = signal<View>('loading');
  fatal = signal('');
  canRetry = signal(false);
  error = signal('');
  busy = signal(false);

  emergency = signal<Emergency | null>(null);
  docs = signal<PublicDocument[]>([]);
  loadingDocs = signal(false);
  selected = signal<number[]>([]);
  requester = new FormControl('', { nonNullable: true });

  request = signal<RequestAccess | null>(null);
  otp = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] });
  otpSeconds = signal(0);

  files = signal<FileLink[]>([]);
  remaining = signal(0);
  private totalSeconds = 180;
  percent = computed(() => Math.min(100, Math.max(0, (this.remaining() / this.totalSeconds) * 100)));

  private accessTimer?: number;
  private otpTimer?: number;
  private serverOffsetMs = 0;
  private expiresAtMs = 0;

  ngOnInit(): void { void this.loadEmergency(); }

  ngOnDestroy(): void {
    this.stopAccessTimer();
    this.stopOtpTimer();
  }

  // ------------------------------------------------------------ Carga inicial
  async loadEmergency(): Promise<void> {
    this.view.set('loading');
    this.canRetry.set(false);
    try {
      this.emergency.set(await firstValueFrom(this.api.emergency(this.code)));
      const resumed = await this.tryResume();
      if (!resumed) this.view.set('menu');
    } catch (e) {
      this.fatal.set(errorMessage(e, 'No se pudo leer la pulsera.'));
      this.canRetry.set(httpStatus(e) === 0 || httpStatus(e) >= 500);
      this.view.set('unavailable');
    }
  }

  /** Si el paramédico recarga la página dentro de los 3 minutos, retoma la descarga. */
  private async tryResume(): Promise<boolean> {
    const id = storageGet(this.storageKey);
    if (!id) return false;
    try {
      const res = await firstValueFrom(this.api.getFiles(id));
      this.startAccessTimer(res);
      this.view.set('files');
      return true;
    } catch {
      storageRemove(this.storageKey);
      return false;
    }
  }

  // ------------------------------------------------------------ Documentos
  async openDocs(): Promise<void> {
    this.error.set('');
    this.view.set('docs');
    this.loadingDocs.set(true);
    try {
      this.docs.set(await firstValueFrom(this.api.publicDocuments(this.code)));
      const valid = new Set(this.docs().map((d) => d.documentId));
      this.selected.set(this.selected().filter((id) => valid.has(id)));
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudieron cargar los documentos.'));
    } finally {
      this.loadingDocs.set(false);
    }
  }

  isSelected(id: number): boolean { return this.selected().includes(id); }

  toggle(id: number): void {
    this.selected.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async requestDocs(): Promise<void> {
    if (this.selected().length === 0) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.api.requestAccess(this.code, this.selected(), this.requester.value.trim() || null),
      );
      this.request.set(res);
      this.otp.reset('');
      this.startOtpTimer(res.otpExpiresAt);
      this.view.set('otp');
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudo enviar el código.'));
    } finally {
      this.busy.set(false);
    }
  }

  // ------------------------------------------------------------ OTP
  async verify(): Promise<void> {
    const req = this.request();
    if (!req || this.otp.invalid) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.api.verifyOtp(req.requestId, this.otp.value));
      this.stopOtpTimer();
      storageSet(this.storageKey, req.requestId);
      this.startAccessTimer(res);
      this.otp.reset('');
      this.view.set('files');
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudo verificar el código.'));
      this.otp.reset('');
    } finally {
      this.busy.set(false);
    }
  }

  async resendOtp(): Promise<void> {
    this.stopOtpTimer();
    await this.requestDocs();
    // Si el servidor rechazó el reenvío (p. ej. espera de 1 minuto), nos quedamos en la pantalla del código.
    if (this.view() === 'otp' && this.error()) this.startOtpTimer(this.request()?.otpExpiresAt ?? '');
  }

  backToDocs(): void {
    this.stopOtpTimer();
    this.error.set('');
    this.view.set('docs');
  }

  // ------------------------------------------------------------ Temporizador de vigencia del OTP
  private startOtpTimer(expiresAtIso: string): void {
    this.stopOtpTimer();
    const end = new Date(expiresAtIso).getTime();
    const tick = () => this.otpSeconds.set(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    this.otpTimer = window.setInterval(tick, 1000);
  }

  private stopOtpTimer(): void {
    if (this.otpTimer) window.clearInterval(this.otpTimer);
    this.otpTimer = undefined;
  }

  // ------------------------------------------------------------ Temporizador de descarga (3 minutos)
  private startAccessTimer(res: FilesResponse): void {
    this.stopAccessTimer();
    // El reloj del servidor manda: se calcula la diferencia con el del dispositivo.
    this.serverOffsetMs = new Date(res.serverNow).getTime() - Date.now();
    this.expiresAtMs = new Date(res.expiresAt).getTime();
    this.totalSeconds = Math.max(1, Math.round((this.expiresAtMs - new Date(res.serverNow).getTime()) / 1000));
    this.files.set(res.files);
    this.tick();
    this.accessTimer = window.setInterval(() => this.tick(), 250);
  }

  private tick(): void {
    const msLeft = this.expiresAtMs - (Date.now() + this.serverOffsetMs);
    if (msLeft <= 0) { this.expireAccess(); return; }
    this.remaining.set(Math.ceil(msLeft / 1000));
  }

  private stopAccessTimer(): void {
    if (this.accessTimer) window.clearInterval(this.accessTimer);
    this.accessTimer = undefined;
  }

  private expireAccess(): void {
    this.stopAccessTimer();
    this.files.set([]);          // se borran los enlaces de la memoria de la página
    this.remaining.set(0);
    storageRemove(this.storageKey);
    this.view.set('expired');
  }

  closeAccess(): void { this.expireAccess(); }
}
