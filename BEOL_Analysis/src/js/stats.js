/* stats.js — regression, ANOVA, distributions (t, F) */
(function () {
  'use strict';
  const App = window.App;
  const S = (App.statsLib = {});

  // ---- log-gamma & regularized incomplete beta (Numerical Recipes) ----
  function gammaln(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  S.betai = (a, b, x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  };
  /** two-sided p-value of Student t */
  S.tPValue = (t, df) => (df > 0 && isFinite(t) ? S.betai(df / 2, 0.5, df / (df + t * t)) : NaN);
  /** upper-tail p-value of F */
  S.fPValue = (F, d1, d2) => (d1 > 0 && d2 > 0 && isFinite(F) && F >= 0 ? S.betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * F)) : NaN);
  /** two-sided critical t for confidence level (bisection) */
  S.tCrit = (df, conf = 0.95) => {
    const alpha = 1 - conf;
    let lo = 0, hi = 1000;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (S.tPValue(mid, df) > alpha) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };

  /** simple linear regression y = a + b x */
  S.linreg = (xs, ys) => {
    const P = [];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) P.push([x, y]);
    }
    const n = P.length;
    if (n < 3) return { n };
    let sx = 0, sy = 0;
    P.forEach(([x, y]) => { sx += x; sy += y; });
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    P.forEach(([x, y]) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; });
    if (sxx === 0) return { n };
    const b = sxy / sxx, a = my - b * mx;
    const sse = Math.max(0, syy - b * sxy);
    const r2 = syy > 0 ? 1 - sse / syy : 1;
    const s = Math.sqrt(sse / (n - 2));
    const seB = s / Math.sqrt(sxx);
    const t = seB > 0 ? b / seB : Infinity;
    const p = seB > 0 ? S.tPValue(t, n - 2) : 0;
    const r = Math.sign(b) * Math.sqrt(Math.max(0, r2));
    const tc = S.tCrit(n - 2);
    const band = (x) => tc * s * Math.sqrt(1 / n + (x - mx) ** 2 / sxx);
    const xmin = Math.min(...P.map((q) => q[0])), xmax = Math.max(...P.map((q) => q[0]));
    return { n, a, b, r, r2, s, seB, t, p, mx, my, sxx, band, xmin, xmax, predict: (x) => a + b * x };
  };

  /** one-way ANOVA; groups: array of numeric arrays */
  S.anova = (groups) => {
    const G = groups.map((g) => g.filter((v) => typeof v === 'number' && isFinite(v))).filter((g) => g.length);
    const k = G.length, N = G.reduce((s, g) => s + g.length, 0);
    if (k < 2 || N <= k) return { k, N };
    const grand = G.reduce((s, g) => s + g.reduce((a, b) => a + b, 0), 0) / N;
    let ssb = 0, ssw = 0;
    G.forEach((g) => {
      const m = g.reduce((a, b) => a + b, 0) / g.length;
      ssb += g.length * (m - grand) ** 2;
      g.forEach((v) => (ssw += (v - m) ** 2));
    });
    const d1 = k - 1, d2 = N - k;
    const F = ssw > 0 ? ssb / d1 / (ssw / d2) : Infinity;
    return { k, N, F, d1, d2, p: ssw > 0 ? S.fPValue(F, d1, d2) : 0 };
  };

  S.fmtP = (p) => (p == null || isNaN(p) ? '—' : p < 1e-4 ? '< 0.0001' : p.toFixed(4));
})();
