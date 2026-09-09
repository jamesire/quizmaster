// Packs {quizId, username} into a single opaque-looking, URL-safe token
// for the /play/:token route - e.g. /play/eyJxIjoiQUJDREVGIiwidSI6IkFsaWNlIn0
// instead of /startQuiz/ABCDEF/Alice.
//
// This is NOT encryption - there's no secret key, and it's trivially
// decodable by anyone who pastes it into a base64 decoder. It's there
// purely so the URL doesn't spell out the app's internal route/param
// names ("startQuiz", "quizId", "username"). Neither value is actually
// sensitive: the quiz ID is already meant to be shared (it's the same
// code shown in the lobby and put into invite links), and the username
// is just the public display name everyone in the room already sees.
export class QuizLinkToken {
  static encode(quizId: string, username: string): string {
    return QuizLinkToken.toBase64Url(JSON.stringify({ q: quizId, u: username }));
  }

  static decode(token: string): { quizId: string; username: string } | null {
    try {
      const parsed = JSON.parse(QuizLinkToken.fromBase64Url(token));
      if (typeof parsed.q !== 'string' || typeof parsed.u !== 'string') {
        return null;
      }
      return { quizId: parsed.q, username: parsed.u };
    } catch {
      return null;
    }
  }

  // btoa/atob only handle Latin1, so a UTF-8 name (an emoji, an accented
  // character) has to be percent-encoded and back around them.
  private static toBase64Url(str: string): string {
    const base64 = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      (_, hex) => String.fromCharCode(parseInt(hex, 16))));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private static fromBase64Url(token: string): string {
    let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return decodeURIComponent(atob(base64).split('').map(c =>
      '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  }
}
