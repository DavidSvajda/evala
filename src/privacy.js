const nodes = [...document.querySelectorAll('.privacy-page h1,.privacy-page h2,.privacy-page p')];
const originals = nodes.map((node) => node.innerHTML);
const english = [
  'Privacy in Evala',
  'Guest mode and the local extension',
  'The small evaluation-bar extension uses local Stockfish. It does not send positions to a server or use an account. The web library and training also work without signing in; guest data stays in this browser. Clearing site data can remove this local library.',
  'Game imports and analysis',
  'Importing public games contacts the Chess.com or Lichess API. That service receives the requested username and network request. Evala does not ask for your chess-account password. Entering a username does not verify ownership of that profile.',
  'Server analysis sends the PGN, including headers, moves and any clock annotations. Position analysis sends the FEN, move history and settings. Public analysis uses an eight-hour HttpOnly technical cookie for queues and quotas. Keep the tab open while analysis runs.',
  'Google account',
  'Signing in is optional. Google provides proof of identity, your name and email. Evala receives no password or access to Gmail, Drive or other documents. The Google sign-in library loads on the account page. The server verifies the signature, audience, issuer, expiry and one-time nonce.',
  'Signed-in accounts store an account identifier, name, email, configured chess username, game library, analyses, notes, display settings and training history. Production uses private Azure Blob Storage with separate account records. The HttpOnly login cookie lasts at most 30 days; the server stores only a hash of its random value. You can sign out.',
  'Guest and account libraries are separate in this browser. Importing guest games into an account requires an explicit action. A local copy remains during a connection failure; unfinished analyses may wait until completion before syncing.',
  'Export and deletion',
  'You can export individual games as PGN and delete them from the library. My account offers a JSON data export and account deletion, including saved games and training history. Deleting an Evala account does not delete your Google account or public games at their original provider. Clear site data separately to remove local guest data.',
  'Your own server and the extension',
  'The full extension can use your own server after you enable it. Its API token stays in the tab’s sessionStorage or temporary chrome.storage.session until the browser restarts. It is not shared with the chess site. Access to the server origin is requested when verifying the connection.',
  'Evala has no advertising trackers or analytics scripts. Hosting logs and requests to Google, Chess.com and Lichess are also governed by those providers’ policies. Lichess puzzles are open CC0 data; source-game links appear after solving.',
  'Recovery copies are retained for up to seven days after data is deleted or overwritten. Access is restricted to the application administrator for recovery. Deleting an account revokes sign-in sessions immediately.',
  'Back to app',
];
let language = localStorage.getItem('evala-language') === 'en' ? 'en' : 'cs';
function render() {
  document.documentElement.lang = language;
  document.title = language === 'en' ? 'Privacy · Evala' : 'Soukromí · Evala';
  nodes.forEach((node, index) => {
    if (node.querySelector('a'))
      node.querySelector('a').textContent = language === 'en' ? english[index] : 'Zpět do aplikace';
    else if (language === 'en') node.textContent = english[index];
    else node.innerHTML = originals[index];
  });
  document.querySelector('#privacy-language').textContent =
    language === 'en' ? 'Čeština' : 'English';
}
document.querySelector('#privacy-language').onclick = () => {
  language = language === 'en' ? 'cs' : 'en';
  localStorage.setItem('evala-language', language);
  render();
};
render();
