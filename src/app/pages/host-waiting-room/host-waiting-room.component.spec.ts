import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { HostWaitingRoomComponent } from './host-waiting-room.component';

describe('HostWaitingRoomComponent', () => {
  let component: HostWaitingRoomComponent;
  let fixture: ComponentFixture<HostWaitingRoomComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ HostWaitingRoomComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(HostWaitingRoomComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
