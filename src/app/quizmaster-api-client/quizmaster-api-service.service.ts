import { Component, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

const httpOptions = {
  headers: new HttpHeaders({ 'Content-Type': 'application/json' })
};

@Injectable()
export class QuizmasterApiService {
  response: Observable<any>;
  constructor(private http:HttpClient) { }

  async getRandomQuestion() {
    var response = await this.http.get('quiz/random').toPromise();
    // response.subscribe(result => {
    //   return result;
    // })

    return response["quizQuestion"];
  }

  async joinQuiz(quizId: string, username: string) {
    var body = {
      quizId: quizId,
      username: username
    }

    return await this.http.post('quiz/joinQuiz', body).toPromise();
  }

  async hostQuiz(username: string, difficulty: number) {
    var body = {
      username: username,
      difficulty: difficulty
    }

    return await this.http.post('quiz/hostQuiz', body).toPromise();
  }

}
