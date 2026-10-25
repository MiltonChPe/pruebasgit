import { Component } from '@angular/core';

@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <span class="logo">
      <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" focusable="false">
        <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" fill="#102C53" />
        <path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke="#fff" stroke-width="2" fill="none"
              stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="logo-text">Identi<span class="tap">Tap</span></span>
    </span>
  `,
  styles: [`
    .logo { display: inline-flex; align-items: center; gap: .5rem; margin-bottom: .75rem; }
    .logo-text { font-size: 1.5rem; font-weight: 800; color: #102C53; letter-spacing: -.5px; }
    .tap { color: #0878F9; }
  `],
})
export class LogoComponent {}
