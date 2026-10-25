import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from './shared/logo.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, LogoComponent],
  template: `
    <main id="contenido" class="page-center">
      <section class="card narrow center">
        <app-logo />
        <h1>Página no encontrada</h1>
        <p>La dirección que abriste no existe.</p>
        <a class="btn btn-primary btn-block" routerLink="/admin/login">Ir al inicio</a>
      </section>
    </main>
  `,
})
export class NotFoundComponent {}
