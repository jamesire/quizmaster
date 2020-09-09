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

  async getRandomQuestions(quantity: number = 1) {
    var response = await this.http.post('quiz/random', { quantity: quantity }).toPromise();
    // response.subscribe(result => {
    //   return result;
    // })

    return response["quizQuestions"];
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
