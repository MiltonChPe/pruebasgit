import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-alert',
  standalone: true,
  template: `
    <div class="alert" [class.alert-error]="type === 'error'" [class.alert-success]="type === 'success'"
         [class.alert-info]="type === 'info'" [attr.role]="type === 'error' ? 'alert' : 'status'">
      <ng-content />
    </div>
  `,
})
export class AlertComponent {
  @Input() type: 'error' | 'success' | 'info' = 'info';
}
