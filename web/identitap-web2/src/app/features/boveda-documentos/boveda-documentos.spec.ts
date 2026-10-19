import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BovedaDocumentos } from './boveda-documentos';

describe('BovedaDocumentos', () => {
  let component: BovedaDocumentos;
  let fixture: ComponentFixture<BovedaDocumentos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BovedaDocumentos],
    }).compileComponents();

    fixture = TestBed.createComponent(BovedaDocumentos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
