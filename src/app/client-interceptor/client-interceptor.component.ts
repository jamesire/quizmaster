import { Component, OnInit } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-client-interceptor',
  templateUrl: './client-interceptor.component.html'
})
export class ClientInterceptorComponent implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
  
    req = req.clone({
      url: environment.QUIZMASTER_API_URL + req.url
    });

    return next.handle(req);
  }
}
