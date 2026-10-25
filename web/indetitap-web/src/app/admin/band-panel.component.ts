import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/errors';
import { Elder } from '../core/models';
import { AlertComponent } from '../shared/alert.component';

type Confirm = 'deactivate' | 'unlink' | null;

@Component({
  selector: 'app-band-panel',
  standalone: true,
  imports: [ReactiveFormsModule, AlertComponent],
  template: `
    <h2>Pulsera NFC</h2>

    @if (error()) { <app-alert type="error">{{ error() }}</app-alert> }
    @if (ok()) { <app-alert type="success">{{ ok() }}</app-alert> }

    @if (elder.bandId) {
      <div class="item" style="margin-bottom:1rem">
        <div>
          <div class="hint">Código de la pulsera</div>
          <div class="item-title" style="font-size:1.3rem; letter-spacing:1px">{{ elder.nfcCode }}</div>
        </div>
        <span class="chip" [class.chip-ok]="elder.bandStatus === 'Activa'" [class.chip-off]="elder.bandStatus !== 'Activa'">
          {{ elder.bandStatus === 'Activa' ? '● Activa' : '○ Inactiva' }}
        </span>
      </div>

      @if (elder.bandStatus === 'Activa') {
        <app-alert type="info">
          <strong>Botón de contingencia.</strong> Si pierdes la pulsera o te la roban, desactívala: dejará de mostrar
          datos y documentos de inmediato. Podrás reactivarla cuando quieras.
        </app-alert>

        @if (confirm() === 'deactivate') {
          <p class="error-text">¿Seguro que quieres desactivar la pulsera?</p>
          <div class="row">
            <button type="button" class="btn btn-danger-solid" (click)="setStatus('Inactiva')" [disabled]="busy()">Sí, desactivar NFC</button>
            <button type="button" class="btn btn-secondary" (click)="confirm.set(null)">Cancelar</button>
          </div>
        } @else {
          <button type="button" class="btn btn-danger btn-block" (click)="confirm.set('deactivate')">Desactivar NFC</button>
        }
      } @else {
        <app-alert type="error">La pulsera está desactivada: quien la escanee no verá ningún dato.</app-alert>
        <button type="button" class="btn btn-success btn-block" (click)="setStatus('Activa')" [disabled]="busy()">Reactivar pulsera</button>
      }

      <hr style="border:none; border-top:1px solid var(--border); margin:1.5rem 0" />

      <h3>Cambiar de pulsera</h3>
      <p class="hint">Si compraste otra, primero desvincula esta y luego vincula la nueva con los códigos de su tarjeta.</p>
      @if (confirm() === 'unlink') {
        <p class="error-text">Esta pulsera quedará desactivada y sin dueño.</p>
        <div class="row">
          <button type="button" class="btn btn-danger-solid" (click)="unlink()" [disabled]="busy()">Sí, desvincular</button>
          <button type="button" class="btn btn-secondary" (click)="confirm.set(null)">Cancelar</button>
        </div>
      } @else {
        <button type="button" class="btn btn-secondary" (click)="confirm.set('unlink')">Desvincular pulsera</button>
      }
    } @else {
      <app-alert type="error">Este perfil no tiene una pulsera vinculada. Nadie podrá consultarlo hasta que vincules una.</app-alert>

      <form [formGroup]="linkForm" (ngSubmit)="link()" novalidate>
        <div class="grid-2">
          <div class="field">
            <label for="nfc">Código de la pulsera</label>
            <input id="nfc" type="text" formControlName="nfcCode" autocapitalize="characters" autocomplete="off" />
          </div>
          <div class="field">
            <label for="claim">Código de activación</label>
            <input id="claim" type="text" formControlName="claimCode" autocapitalize="characters" autocomplete="off" />
          </div>
        </div>
        <button class="btn btn-primary btn-block" type="submit" [disabled]="busy() || linkForm.invalid">Vincular pulsera</button>
      </form>
    }
  `,
})
export class BandPanelComponent {
  @Input({ required: true }) elder!: Elder;
  @Output() changed = new EventEmitter<void>();

  private api = inject(ApiService);
  private fb = inject(FormBuilder);

  busy = signal(false);
  error = signal('');
  ok = signal('');
  confirm = signal<Confirm>(null);

  linkForm = this.fb.nonNullable.group({
    nfcCode: ['', Validators.required],
    claimCode: ['', Validators.required],
  });

  private async run(action: () => Promise<unknown>, okMsg: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.ok.set('');
    try {
      await action();
      this.confirm.set(null);
      this.ok.set(okMsg);
      this.changed.emit();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  setStatus(status: 'Activa' | 'Inactiva'): Promise<void> {
    return this.run(
      () => firstValueFrom(this.api.setBandStatus(status)),
      status === 'Activa' ? 'La pulsera quedó activa.' : 'La pulsera quedó desactivada.',
    );
  }

  unlink(): Promise<void> {
    return this.run(() => firstValueFrom(this.api.unlinkBand()), 'Pulsera desvinculada.');
  }

  link(): Promise<void> {
    const { nfcCode, claimCode } = this.linkForm.getRawValue();
    return this.run(() => firstValueFrom(this.api.linkBand(nfcCode.trim(), claimCode.trim())), 'Pulsera vinculada y activa.');
  }
}
