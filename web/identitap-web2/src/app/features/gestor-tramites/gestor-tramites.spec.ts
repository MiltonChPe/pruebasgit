import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GestorTramites } from './gestor-tramites';

describe('GestorTramites', () => {
  let component: GestorTramites;
  let fixture: ComponentFixture<GestorTramites>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestorTramites],
    }).compileComponents();

    fixture = TestBed.createComponent(GestorTramites);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
