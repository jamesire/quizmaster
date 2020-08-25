import { TestBed } from '@angular/core/testing';

import { PartyMemberService } from './party-member.service';

describe('PartyMemberService', () => {
  let service: PartyMemberService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PartyMemberService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
