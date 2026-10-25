import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/errors';
import { Elder, ElderPayload } from '../core/models';
import { AlertComponent } from './alert.component';

const PHONE = /^\+?[\d\s()-]{10,18}$/;

@Component({
  selector: 'app-elder-form',
  standalone: true,
  imports: [ReactiveFormsModule, AlertComponent],
  template: `
    @if (error()) { <app-alert type="error">{{ error() }}</app-alert> }
    @if (ok()) { <app-alert type="success">{{ ok() }}</app-alert> }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <h3>Datos del adulto mayor</h3>

      <div class="field">
        <label for="fullName">Nombre completo</label>
        <input id="fullName" type="text" formControlName="fullName" autocomplete="off" />
        @if (bad('fullName')) { <p class="error-text">Escribe el nombre completo.</p> }
      </div>

      <div class="grid-2">
        <div class="field">
          <label for="birthDate">Fecha de nacimiento</label>
          <input id="birthDate" type="date" formControlName="birthDate" [max]="today" min="1900-01-01" />
          @if (bad('birthDate')) { <p class="error-text">Elige una fecha válida.</p> }
        </div>
        <div class="field">
          <label for="bloodType">Tipo de sangre</label>
          <select id="bloodType" formControlName="bloodType">
            <option value="">Selecciona…</option>
            @for (b of bloodTypes; track b) { <option [value]="b">{{ b }}</option> }
          </select>
          @if (bad('bloodType')) { <p class="error-text">Selecciona el tipo de sangre.</p> }
        </div>
      </div>

      <div class="field">
        <label for="allergies">Alergias <span class="hint">(opcional)</span></label>
        <textarea id="allergies" formControlName="allergies" maxlength="500"
                  placeholder="Ej. Penicilina, mariscos. Déjalo vacío si no tiene."></textarea>
      </div>

      <div class="field">
        <label for="phoneNumber">Celular del adulto mayor</label>
        <input id="phoneNumber" type="tel" formControlName="phoneNumber" inputmode="tel" placeholder="442 123 4567" />
        <p class="hint">Aquí llegará el código de seguridad por SMS cuando alguien pida sus documentos.</p>
        @if (bad('phoneNumber')) { <p class="error-text">Escribe un celular de 10 dígitos.</p> }
      </div>

      <h3 style="margin-top:1.5rem">Contacto de emergencia</h3>
      <div class="grid-2">
        <div class="field">
          <label for="ecName">Nombre</label>
          <input id="ecName" type="text" formControlName="emergencyContactName" autocomplete="off" />
          @if (bad('emergencyContactName')) { <p class="error-text">Escribe el nombre del contacto.</p> }
        </div>
        <div class="field">
          <label for="ecPhone">Teléfono</label>
          <input id="ecPhone" type="tel" formControlName="emergencyContactPhone" inputmode="tel" placeholder="442 765 4321" />
          @if (bad('emergencyContactPhone')) { <p class="error-text">Escribe un teléfono de 10 dígitos.</p> }
        </div>
      </div>

      @if (mode === 'create') {
        <h3 style="margin-top:1.5rem">Pulsera NFC</h3>
        <p class="hint">Estos dos códigos vienen impresos en la tarjeta que está dentro de la caja.</p>
        <div class="grid-2">
          <div class="field">
            <label for="nfcCode">Código de la pulsera</label>
            <input id="nfcCode" type="text" formControlName="nfcCode" autocapitalize="characters" autocomplete="off"
                   placeholder="Ej. K7M2Q9XW4P" />
            @if (bad('nfcCode')) { <p class="error-text">Escribe el código de la pulsera.</p> }
          </div>
          <div class="field">
            <label for="claimCode">Código de activación</label>
            <input id="claimCode" type="text" formControlName="claimCode" autocapitalize="characters" autocomplete="off"
                   placeholder="Ej. 8H3NQ7TD" />
            @if (bad('claimCode')) { <p class="error-text">Escribe el código de activación.</p> }
          </div>
        </div>
      }

      <button class="btn btn-primary btn-block" type="submit" [disabled]="busy()">
        @if (busy()) { <span class="spinner"></span> Guardando… }
        @else { {{ mode === 'create' ? 'Guardar perfil y vincular pulsera' : 'Guardar cambios' }} }
      </button>
    </form>
  `,
})
export class ElderFormComponent implements OnInit {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() elder: Elder | null = null;
  @Output() saved = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private api = inject(ApiService);

  readonly bloodTypes = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
  readonly today = new Date().toISOString().slice(0, 10);

  busy = signal(false);
  error = signal('');
  ok = signal('');
  private submitted = false;

  form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    birthDate: ['', Validators.required],
    bloodType: ['', Validators.required],
    allergies: ['', Validators.maxLength(500)],
    phoneNumber: ['', [Validators.required, Validators.pattern(PHONE)]],
    emergencyContactName: ['', [Validators.required, Validators.maxLength(150)]],
    emergencyContactPhone: ['', [Validators.required, Validators.pattern(PHONE)]],
    nfcCode: [''],
    claimCode: [''],
  });

  ngOnInit(): void {
    if (this.mode === 'create') {
      this.form.controls.nfcCode.addValidators(Validators.required);
      this.form.controls.claimCode.addValidators(Validators.required);
      this.form.controls.nfcCode.updateValueAndValidity();
      this.form.controls.claimCode.updateValueAndValidity();
    } else if (this.elder) {
      this.form.patchValue({
        fullName: this.elder.fullName,
        birthDate: this.elder.birthDate,
        bloodType: this.elder.bloodType,
        allergies: this.elder.allergies ?? '',
        phoneNumber: this.elder.phoneNumber,
        emergencyContactName: this.elder.emergencyContactName,
        emergencyContactPhone: this.elder.emergencyContactPhone,
      });
    }
  }

  bad(name: 'fullName' | 'birthDate' | 'bloodType' | 'phoneNumber' | 'emergencyContactName' | 'emergencyContactPhone' | 'nfcCode' | 'claimCode'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted);
  }

  async submit(): Promise<void> {
    this.submitted = true;
    this.error.set('');
    this.ok.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados en rojo.');
      return;
    }

    const v = this.form.getRawValue();
    const base: ElderPayload = {
      fullName: v.fullName.trim(),
      birthDate: v.birthDate,
      bloodType: v.bloodType,
      allergies: v.allergies.trim() || null,
      phoneNumber: v.phoneNumber.trim(),
      emergencyContactName: v.emergencyContactName.trim(),
      emergencyContactPhone: v.emergencyContactPhone.trim(),
    };

    this.busy.set(true);
    try {
      if (this.mode === 'create') {
        await firstValueFrom(this.api.createElder({ ...base, nfcCode: v.nfcCode.trim(), claimCode: v.claimCode.trim() }));
      } else {
        await firstValueFrom(this.api.updateElder(base));
        this.ok.set('Los datos se guardaron correctamente.');
      }
      this.saved.emit();
    } catch (e) {
      this.error.set(errorMessage(e, 'No se pudo guardar. Intenta de nuevo.'));
    } finally {
      this.busy.set(false);
    }
  }
}
