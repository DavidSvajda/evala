export function analysisPage(url) {
  const { hostname, pathname, protocol } = new URL(url);
  if (protocol !== 'https:') return null;
  if (hostname === 'lichess.org') {
    if (/^\/(?:game\/)?[a-z0-9]{8}\/(?:white|black)\/analysis\/?$/i.test(pathname)) return 'review';
    if (/^\/analysis(?:\/|$)/.test(pathname) && !pathname.startsWith('/analysis/embed'))
      return 'board';
  }
  if (hostname === 'www.chess.com' || hostname === 'chess.com') {
    if (/^\/analysis\/game\/(?:live|daily)\/\d+(?:\/(?:review|analysis))?\/?$/.test(pathname))
      return 'review';
    if (/^\/analysis(?:\/)?$/.test(pathname)) return 'board';
  }
  return null;
}
