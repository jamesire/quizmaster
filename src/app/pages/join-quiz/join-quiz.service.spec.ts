import { TestBed } from '@angular/core/testing';

import { JoinQuizService } from './join-quiz.service';

describe('JoinQuizService', () => {
  let service: JoinQuizService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(JoinQuizService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
