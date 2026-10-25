import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'admin/login' },

  // ---------- Web 1: Portal administrativo ----------
  {
    path: 'admin/login',
    canActivate: [guestGuard],
    loadComponent: () => import('./admin/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin/register',
    canActivate: [guestGuard],
    loadComponent: () => import('./admin/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'admin/verify-email',
    loadComponent: () => import('./admin/verify-email.component').then((m) => m.VerifyEmailComponent),
  },
  {
    path: 'admin/dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/dashboard.component').then((m) => m.DashboardComponent),
  },
  { path: 'admin', pathMatch: 'full', redirectTo: 'admin/dashboard' },

  // ---------- Web 2: Escáner público ----------
  {
    path: 'scan/:code',
    loadComponent: () => import('./scan/scan.component').then((m) => m.ScanComponent),
  },

  {
    path: '**',
    loadComponent: () => import('./not-found.component').then((m) => m.NotFoundComponent),
  },
];
