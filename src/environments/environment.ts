// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  // Socket.IO is served from the same origin as this app (see server.js),
  // so no URL is needed - leave blank and the client defaults to same-origin.
  SOCKET_IO_URL: '',
  // Trivia questions are fetched directly from the Open Trivia DB - no
  // backend of our own is needed just to proxy a public, CORS-enabled API.
  OPEN_TRIVIA_DB_URL: 'https://opentdb.com/api.php',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
