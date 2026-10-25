import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/errors';
import { AccessLog, RequestStatus } from '../core/models';
import { AlertComponent } from '../shared/alert.component';

@Component({
  selector: 'app-logs-panel',
  standalone: true,
  imports: [DatePipe, AlertComponent],
  template: `
    <div class="row-between">
      <h2 style="margin:0">Registros de acceso</h2>
      <button type="button" class="btn btn-secondary btn-small" (click)="load()" [disabled]="loading()">Actualizar</button>
    </div>
    <p class="hint">Quién pidió documentos de tu familiar, cuáles y a qué hora (hora de tu dispositivo).</p>

    @if (error()) { <app-alert type="error">{{ error() }}</app-alert> }

    @if (loading()) {
      <p class="center"><span class="spinner spinner-dark"></span> Cargando…</p>
    } @else if (logs().length === 0) {
      <p class="center hint">Todavía nadie ha solicitado documentos.</p>
    } @else {
      @for (l of logs(); track l.requestId) {
        <div class="item">
          <div style="flex:1 1 260px">
            <div class="item-title">{{ l.requestedAt | date: 'dd/MM/yyyy · HH:mm' }}</div>
            <div>{{ l.documents || 'Documentos eliminados' }}</div>
            <div class="hint">
              Solicitó: {{ l.requesterName || 'No indicó nombre' }}
              @if (l.requesterIp) { · IP {{ l.requesterIp }} }
            </div>
            @if (l.status === 'Aprobado' && l.approvedAt) {
              <div class="hint">Autorizado a las {{ l.approvedAt | date: 'HH:mm:ss' }}</div>
            }
          </div>
          <span class="chip" [class]="chipClass(l.status)">{{ label(l.status) }}</span>
        </div>
      }
    }
  `,
})
export class LogsPanelComponent implements OnInit {
  private api = inject(ApiService);

  logs = signal<AccessLog[]>([]);
  loading = signal(true);
  error = signal('');

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.logs.set(await firstValueFrom(this.api.getAccessLogs()));
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudieron cargar los registros.'));
    } finally {
      this.loading.set(false);
    }
  }

  label(s: RequestStatus): string {
    return { Aprobado: '✔ Autorizado', Pendiente: '… Esperando código', Rechazado: '✖ Rechazado', Expirado: '⏱ Expiró' }[s];
  }

  chipClass(s: RequestStatus): string {
    const tone = { Aprobado: 'chip-ok', Pendiente: 'chip-warn', Rechazado: 'chip-bad', Expirado: 'chip-off' }[s];
    return `chip ${tone}`;
  }
}
