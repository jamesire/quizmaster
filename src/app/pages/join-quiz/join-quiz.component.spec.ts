import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { JoinQuizComponent } from './join-quiz.component';

describe('JoinQuizComponent', () => {
  let component: JoinQuizComponent;
  let fixture: ComponentFixture<JoinQuizComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ JoinQuizComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(JoinQuizComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
