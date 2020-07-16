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

}
