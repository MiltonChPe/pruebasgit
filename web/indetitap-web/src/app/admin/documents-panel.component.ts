import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { MAX_DOCUMENTS, MAX_FILE_MB } from '../core/config';
import { errorMessage } from '../core/errors';
import { formatBytes } from '../core/format';
import { DocumentItem } from '../core/models';
import { AlertComponent } from '../shared/alert.component';

@Component({
  selector: 'app-documents-panel',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, AlertComponent],
  template: `
    <h2>Bolsa de documentos</h2>
    <p class="hint">
      Sube los PDF que un paramédico o funcionario podría necesitar (credencial médica, recetas, testamento…).
      Solo se entregan cuando el adulto mayor autoriza con su código por SMS. Límite: {{ max }} documentos de
      {{ maxMb }} MB.
    </p>

    @if (error()) { <app-alert type="error">{{ error() }}</app-alert> }
    @if (ok()) { <app-alert type="success">{{ ok() }}</app-alert> }

    <!-- Subir nuevo -->
    <div class="card upload-box">
      <h3>Subir documento</h3>
      <div class="field">
        <label for="file">Archivo PDF</label>
        <input #fileInput id="file" type="file" accept="application/pdf,.pdf" (change)="onFile($event)" />
      </div>
      <div class="field">
        <label for="docName">Nombre del documento <span class="hint">(opcional)</span></label>
        <input id="docName" type="text" [formControl]="nameCtrl" maxlength="150" placeholder="Ej. Receta de insulina" />
      </div>
      <button type="button" class="btn btn-primary" (click)="upload(fileInput)"
              [disabled]="busy() || !file() || docs().length >= max">
        @if (busy()) { <span class="spinner"></span> Subiendo… } @else { Subir documento }
      </button>
      <p class="hint" style="margin:.75rem 0 0">{{ docs().length }} de {{ max }} documentos</p>
    </div>

    <!-- Lista -->
    <div style="margin-top:1.25rem">
      @if (loading()) {
        <p class="center"><span class="spinner spinner-dark"></span> Cargando documentos…</p>
      } @else if (docs().length === 0) {
        <p class="center hint">Aún no has subido documentos.</p>
      } @else {
        @for (d of docs(); track d.documentId) {
          <div class="item">
            <div style="flex:1 1 220px">
              @if (editingId() === d.documentId) {
                <label class="visually-hidden" [for]="'ren-' + d.documentId">Nuevo nombre</label>
                <input [id]="'ren-' + d.documentId" type="text" [formControl]="renameCtrl" maxlength="150" />
              } @else {
                <div class="item-title">📄 {{ d.documentName }}</div>
                <div class="hint">{{ size(d.sizeBytes) }} · {{ d.createdAt | date: 'dd/MM/yyyy' }}</div>
              }
            </div>

            <div class="row">
              @if (confirmId() === d.documentId) {
                <span class="error-text" style="margin:0">¿Eliminar este documento?</span>
                <button type="button" class="btn btn-danger-solid btn-small" (click)="remove(d)" [disabled]="busy()">Sí, eliminar</button>
                <button type="button" class="btn btn-secondary btn-small" (click)="confirmId.set(null)">Cancelar</button>
              } @else if (editingId() === d.documentId) {
                <button type="button" class="btn btn-primary btn-small" (click)="saveRename(d)" [disabled]="busy()">Guardar</button>
                <button type="button" class="btn btn-secondary btn-small" (click)="editingId.set(null)">Cancelar</button>
              } @else {
                <button type="button" class="btn btn-secondary btn-small" (click)="startRename(d)">Renombrar</button>
                <button type="button" class="btn btn-secondary btn-small" (click)="startReplace(d, replaceInput)" [disabled]="busy()">Reemplazar PDF</button>
                <button type="button" class="btn btn-danger btn-small" (click)="confirmId.set(d.documentId)">Eliminar</button>
              }
            </div>
          </div>
        }
      }
    </div>

    <!-- Input oculto compartido para "Reemplazar PDF" -->
    <input #replaceInput type="file" accept="application/pdf,.pdf" class="visually-hidden" tabindex="-1"
           (change)="onReplace($event, replaceInput)" aria-hidden="true" />
  `,
  styles: [`.upload-box { background: #F7FAFF; box-shadow: none; }`],
})
export class DocumentsPanelComponent implements OnInit {
  private api = inject(ApiService);

  readonly max = MAX_DOCUMENTS;
  readonly maxMb = MAX_FILE_MB;
  readonly size = formatBytes;

  docs = signal<DocumentItem[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  ok = signal('');
  file = signal<File | null>(null);
  editingId = signal<number | null>(null);
  confirmId = signal<number | null>(null);
  private replaceTarget: number | null = null;

  nameCtrl = new FormControl('', { nonNullable: true });
  renameCtrl = new FormControl('', { nonNullable: true });

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.docs.set(await firstValueFrom(this.api.getDocuments()));
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudieron cargar los documentos.'));
    } finally {
      this.loading.set(false);
    }
  }

  private validatePdf(f: File): string | null {
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return 'Solo se permiten archivos PDF.';
    if (f.size > MAX_FILE_MB * 1024 * 1024) return `El archivo supera el máximo de ${MAX_FILE_MB} MB.`;
    if (f.size === 0) return 'El archivo está vacío.';
    return null;
  }

  onFile(ev: Event): void {
    this.error.set('');
    this.ok.set('');
    const f = (ev.target as HTMLInputElement).files?.[0] ?? null;
    if (f) {
      const problem = this.validatePdf(f);
      if (problem) { this.error.set(problem); this.file.set(null); (ev.target as HTMLInputElement).value = ''; return; }
    }
    this.file.set(f);
  }

  async upload(input: HTMLInputElement): Promise<void> {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.error.set('');
    this.ok.set('');
    try {
      await firstValueFrom(this.api.uploadDocument(f, this.nameCtrl.value.trim()));
      this.ok.set('Documento subido correctamente.');
      this.file.set(null);
      this.nameCtrl.setValue('');
      input.value = '';
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudo subir el documento.'));
    } finally {
      this.busy.set(false);
    }
  }

  startRename(d: DocumentItem): void {
    this.confirmId.set(null);
    this.renameCtrl.setValue(d.documentName);
    this.editingId.set(d.documentId);
  }

  async saveRename(d: DocumentItem): Promise<void> {
    const name = this.renameCtrl.value.trim();
    if (!name) { this.error.set('El nombre no puede estar vacío.'); return; }
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.renameDocument(d.documentId, name));
      this.editingId.set(null);
      this.ok.set('Nombre actualizado.');
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  startReplace(d: DocumentItem, input: HTMLInputElement): void {
    this.replaceTarget = d.documentId;
    input.value = '';
    input.click();
  }

  async onReplace(ev: Event, input: HTMLInputElement): Promise<void> {
    const f = (ev.target as HTMLInputElement).files?.[0];
    const id = this.replaceTarget;
    input.value = '';
    if (!f || id === null) return;

    const problem = this.validatePdf(f);
    if (problem) { this.error.set(problem); return; }

    this.busy.set(true);
    this.error.set('');
    this.ok.set('');
    try {
      await firstValueFrom(this.api.replaceDocumentFile(id, f));
      this.ok.set('Archivo reemplazado correctamente.');
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudo reemplazar el archivo.'));
    } finally {
      this.busy.set(false);
      this.replaceTarget = null;
    }
  }

  async remove(d: DocumentItem): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.deleteDocument(d.documentId));
      this.confirmId.set(null);
      this.ok.set('Documento eliminado.');
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
