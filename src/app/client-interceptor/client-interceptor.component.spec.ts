import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientInterceptorComponent } from './client-interceptor.component';

describe('ClientInterceptorComponent', () => {
  let component: ClientInterceptorComponent;
  let fixture: ComponentFixture<ClientInterceptorComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ClientInterceptorComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ClientInterceptorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
