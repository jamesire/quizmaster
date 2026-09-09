import { Injectable } from '@angular/core';
import { Subject } from 'rxjs/Rx';
import { WebsocketService } from '../websocket/websocket.service';

@Injectable({
  providedIn: 'root'
})
export class PartyMemberService {

  public partyMembers: Subject<any>;

  constructor(private wsService: WebsocketService) { 
    this.partyMembers = <Subject<any>>this.wsService
    .connect()
    .map((response: any): any => {
      return response;
    })
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
