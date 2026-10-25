import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <a class="skip-link" href="#contenido">Saltar al contenido</a>
    <router-outlet />
  `,
})
export class AppComponent {}
