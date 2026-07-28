export interface Distribution {
  pdf(x: number): number;
  cdf(x: number): number;
  mean: number;
  variance: number;
}

const SQRT2PI = Math.sqrt(2 * Math.PI);

function erfApprox(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const val = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? val : -val;
}

function lnGamma(z: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

export function normalPdf(x: number, mu = 0, sigma = 1): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * SQRT2PI);
}

export function normalCdf(x: number, mu = 0, sigma = 1): number {
  return 0.5 * (1 + erfApprox((x - mu) / (sigma * Math.SQRT2)));
}

export function normal(mu = 0, sigma = 1): Distribution {
  return { pdf: (x) => normalPdf(x, mu, sigma), cdf: (x) => normalCdf(x, mu, sigma), mean: mu, variance: sigma * sigma };
}

function binomCoeff(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return r;
}

export function binomialPdf(k: number, n: number, p: number): number {
  if (k < 0 || k > n || k !== Math.round(k)) return 0;
  return binomCoeff(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

export function binomialCdf(k: number, n: number, p: number): number {
  let sum = 0;
  for (let i = 0; i <= Math.floor(k); i++) sum += binomialPdf(i, n, p);
  return sum;
}

export function binomial(n: number, p: number): Distribution {
  return {
    pdf: (x) => binomialPdf(Math.round(x), n, p),
    cdf: (x) => binomialCdf(x, n, p),
    mean: n * p,
    variance: n * p * (1 - p),
  };
}

export function poissonPdf(k: number, lambda: number): number {
  if (k < 0 || k !== Math.round(k)) return 0;
  return Math.exp(k * Math.log(lambda) - lambda - lnGamma(k + 1));
}

export function poissonCdf(k: number, lambda: number): number {
  let sum = 0;
  for (let i = 0; i <= Math.floor(k); i++) sum += poissonPdf(i, lambda);
  return sum;
}

export function poisson(lambda: number): Distribution {
  return {
    pdf: (x) => poissonPdf(Math.round(x), lambda),
    cdf: (x) => poissonCdf(x, lambda),
    mean: lambda,
    variance: lambda,
  };
}

export function exponentialPdf(x: number, lambda: number): number {
  return x < 0 ? 0 : lambda * Math.exp(-lambda * x);
}

export function exponentialCdf(x: number, lambda: number): number {
  return x < 0 ? 0 : 1 - Math.exp(-lambda * x);
}

export function exponential(lambda: number): Distribution {
  return {
    pdf: (x) => exponentialPdf(x, lambda),
    cdf: (x) => exponentialCdf(x, lambda),
    mean: 1 / lambda,
    variance: 1 / (lambda * lambda),
  };
}

export function uniformPdf(x: number, a = 0, b = 1): number {
  return x >= a && x <= b ? 1 / (b - a) : 0;
}

export function uniformCdf(x: number, a = 0, b = 1): number {
  if (x < a) return 0;
  if (x > b) return 1;
  return (x - a) / (b - a);
}

export function uniform(a = 0, b = 1): Distribution {
  return {
    pdf: (x) => uniformPdf(x, a, b),
    cdf: (x) => uniformCdf(x, a, b),
    mean: (a + b) / 2,
    variance: (b - a) * (b - a) / 12,
  };
}

export function geometricPdf(k: number, p: number): number {
  if (k < 1 || k !== Math.round(k)) return 0;
  return Math.pow(1 - p, k - 1) * p;
}

export function geometricCdf(k: number, p: number): number {
  if (k < 1) return 0;
  return 1 - Math.pow(1 - p, Math.floor(k));
}

export function geometric(p: number): Distribution {
  return {
    pdf: (x) => geometricPdf(Math.round(x), p),
    cdf: (x) => geometricCdf(x, p),
    mean: 1 / p,
    variance: (1 - p) / (p * p),
  };
}

export function chiSquaredPdf(x: number, k: number): number {
  if (x <= 0) return 0;
  return Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lnGamma(k / 2));
}

export function chiSquaredCdf(x: number, k: number): number {
  if (x <= 0) return 0;
  return lowerRegGamma(k / 2, x / 2);
}

function lowerRegGamma(a: number, x: number): number {
  if (x < a + 1) {
    let sum = 1 / a, term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a, c = 1e30, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - h * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

export function chiSquared(k: number): Distribution {
  return {
    pdf: (x) => chiSquaredPdf(x, k),
    cdf: (x) => chiSquaredCdf(x, k),
    mean: k,
    variance: 2 * k,
  };
}

export function tPdf(x: number, nu: number): number {
  const coeff = Math.exp(lnGamma((nu + 1) / 2) - lnGamma(nu / 2)) / Math.sqrt(nu * Math.PI);
  return coeff * Math.pow(1 + x * x / nu, -(nu + 1) / 2);
}

export function tCdf(x: number, nu: number): number {
  const z = nu / (nu + x * x);
  const ibeta = regBetaInc(nu / 2, 0.5, z);
  return x >= 0 ? 1 - 0.5 * ibeta : 0.5 * ibeta;
}

export function tDist(nu: number): Distribution {
  return {
    pdf: (x) => tPdf(x, nu),
    cdf: (x) => tCdf(x, nu),
    mean: 0,
    variance: nu > 2 ? nu / (nu - 2) : Infinity,
  };
}

export function fPdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const num = Math.exp((d1 / 2) * Math.log(d1) + (d2 / 2) * Math.log(d2) + (d1 / 2 - 1) * Math.log(x));
  const den = Math.exp(((d1 + d2) / 2) * Math.log(d2 + d1 * x) + lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2));
  return num / den;
}

export function fCdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const z = d1 * x / (d1 * x + d2);
  return regBetaInc(d1 / 2, d2 / 2, z);
}

function regBetaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betaCf(a, b, x) / a;
  return 1 - bt * betaCf(b, a, 1 - x) / b;
}

function betaCf(a: number, b: number, x: number): number {
  const maxIter = 200, eps = 1e-12, tiny = 1e-30;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

export function fDist(d1: number, d2: number): Distribution {
  return {
    pdf: (x) => fPdf(x, d1, d2),
    cdf: (x) => fCdf(x, d1, d2),
    mean: d2 > 2 ? d2 / (d2 - 2) : Infinity,
    variance: d2 > 4 ? 2 * d2 * d2 * (d1 + d2 - 2) / (d1 * (d2 - 2) * (d2 - 2) * (d2 - 4)) : Infinity,
  };
}
