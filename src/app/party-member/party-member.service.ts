import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { WebsocketService } from '../websocket/websocket.service';

@Injectable({
  providedIn: 'root'
})
export class PartyMemberService {

  public partyMembers: Subject<any>;

  constructor(private wsService: WebsocketService) {
    // connect() already returns a real Subject - the old
    // .map((response) => response) here was an identity no-op that only
    // existed (via rxjs-compat's prototype-patched .map) to round-trip
    // through an AnonymousSubject and satisfy the `<Subject<any>>` cast
    // below it. Plain rxjs 6 doesn't patch Observable.prototype with
    // .map at all, so that cast would otherwise have been lying about
    // a type that no longer has a .next() method - connect()'s result
    // is used as-is instead.
    this.partyMembers = this.wsService.connect();
  }

  hostQuiz(username, difficulty) {
    var data = {
      username,
      difficulty,
      action: 'host'
    }

    this.partyMembers.next(data);
  }

  joinQuiz(username, quizId) {
    var data = {
      username,
      quizId
    }

    //this.wsService.joinRoom(username, quizId);

    var partyMembersData = {
      username: username,
      quizId: quizId,
      action: 'join'
    }

    this.partyMembers.next(partyMembersData);
  }

  leaveQuiz(username, quizId) {
    // Note: this does not disconnect the socket. The connection is
    // shared for the whole app session (one player might leave a party
    // and then host or join a different quiz afterwards), so only the
    // room membership ends here - not the connection itself.
    var partyMembersData = {
      username: username,
      quizId: quizId,
      action: 'leave'
    }

    this.partyMembers.next(partyMembersData);
  }

  startQuiz(quizId) {
    var startQuizData = {
      quizId: quizId,
      action: 'start'
    }

    this.partyMembers.next(startQuizData);
  }

  getQuestions(quizId, username) {
    var data = {
      quizId: quizId,
      username: username,
      action: 'getQuestions'
    }

    this.partyMembers.next(data);
  }

  submitScore(quizId, username, score) {
    var data = {
      quizId: quizId,
      username: username,
      score: score,
      action: 'submitScore'
    }

    this.partyMembers.next(data);
  }

  voteReplay(quizId, username) {
    var data = {
      quizId: quizId,
      username: username,
      action: 'replayVote'
    }

    this.partyMembers.next(data);
  }

}
