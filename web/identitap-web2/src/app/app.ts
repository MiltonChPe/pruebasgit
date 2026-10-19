import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SidebarComponent } from './core/sidebar/sidebar';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent {
  title = 'identitap-web2';
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  readonly showSidebar = signal(this.shouldShowSidebar());

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.showSidebar.set(this.shouldShowSidebar()));
  }

  private shouldShowSidebar(): boolean {
    return this.authService.estaLogueado() && !['/login', '/registro'].includes(this.router.url);
  }
}