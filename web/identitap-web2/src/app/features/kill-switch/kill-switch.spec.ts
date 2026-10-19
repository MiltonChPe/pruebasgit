import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KillSwitch } from './kill-switch';

describe('KillSwitch', () => {
  let component: KillSwitch;
  let fixture: ComponentFixture<KillSwitch>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KillSwitch],
    }).compileComponents();

    fixture = TestBed.createComponent(KillSwitch);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
