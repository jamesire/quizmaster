import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

// Raw shape returned by GET /api/single-player-questions, before
// QuestionHelper.setAnswerChoices() adds allAnswers/shuffles them - same
// shape server.js's getQuestionsForQuiz()/fetchQuizQuestions() produce,
// and the same shape QuizmasterApiService.getRandomQuestions() returns
// for the (unrelated) dashboard preview tile.
export interface RawQuestion {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
}

// Talks to our own server, not Open Trivia DB directly - kept separate
// from QuizmasterApiService (which fetches straight from OpenTDB for the
// dashboard's "Random Trivia" tile) since that's a different concern and
// a different origin. This one exists specifically so single-player mode
// can reuse the server's shared question pool (see server.js) instead of
// racing OpenTDB's own rate limit itself.
@Injectable({
  providedIn: 'root'
})
export class SinglePlayerApiService {
  constructor(private http: HttpClient) { }

  getQuestions(): Promise<RawQuestion[]> {
    return this.http.get<RawQuestion[]>('/api/single-player-questions').toPromise();
  }
}
