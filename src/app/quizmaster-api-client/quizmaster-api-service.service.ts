import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

// Shape returned by https://opentdb.com/api.php
interface OpenTdbResult {
  category: string;
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

interface OpenTdbResponse {
  response_code: number;
  results: OpenTdbResult[];
}

@Injectable()
export class QuizmasterApiService {
  constructor(private http: HttpClient) { }

  async getRandomQuestions(quantity: number = 1): Promise<any[]> {
    const url = `${environment.OPEN_TRIVIA_DB_URL}?amount=${quantity}`;
    const response = await this.http.get<OpenTdbResponse>(url).toPromise();

    if (response.response_code !== 0) {
      throw new Error('Open Trivia DB could not return questions for this request.');
    }

    return response.results.map(result => ({
      category: this.decodeHtml(result.category),
      type: result.type,
      difficulty: result.difficulty,
      question: this.decodeHtml(result.question),
      correctAnswer: this.decodeHtml(result.correct_answer),
      incorrectAnswers: result.incorrect_answers.map(answer => this.decodeHtml(answer))
    }));
  }

  // Open Trivia DB HTML-encodes its text (e.g. "&quot;", "&#039;") -
  // decode it back to plain text for display.
  private decodeHtml(html: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
  }
}
