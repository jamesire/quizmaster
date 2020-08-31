// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  QUIZMASTER_API_URL: "http://quizmasterapi-dev.eu-west-1.elasticbeanstalk.com/",
  //SOCKET_IO_URL: "http://quizmasterplayermanagement-env.eba-4caag4vh.eu-west-1.elasticbeanstalk.com/",
  //SOCKET_IO_URL: "http://quizmaster-player-service.s3-website-eu-west-1.amazonaws.com",
  SOCKET_IO_URL: "http://localhost:5000"
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
