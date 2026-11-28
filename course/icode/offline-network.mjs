// Test-only preload for the offline Lab 03 suite (`npm run test:tools`), loaded into the test worker and, through
// NODE_OPTIONS=--import, into every azure.mjs process the tests start. It makes the suite hermetic:
// - requests to the public Retail Prices API (prices.azure.com) go to the loopback fake in ICODE_TEST_PRICES_URL,
//   so `plan` and `up` still build their real Retail Prices requests but never leave the machine;
// - any other request to a non-loopback host is refused and recorded in ICODE_TEST_NETWORK_LOG, so a guard test fails.
// Production code is unchanged and never loads this file.
import { appendFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const record = (line) => {
  if (process.env.ICODE_TEST_NETWORK_LOG) appendFileSync(process.env.ICODE_TEST_NETWORK_LOG, line + "\n");
};
const blocked = (host) => {
  record(`blocked ${host}`);
  return new Error(`offline test refused a network call to ${host}`);
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (LOOPBACK.has(url.hostname)) return realFetch(input, init);
  if (url.hostname === "prices.azure.com" && process.env.ICODE_TEST_PRICES_URL) {
    record(`rewrote ${url.origin}${url.pathname}`);
    const fake = new URL(process.env.ICODE_TEST_PRICES_URL);
    fake.search = url.search;
    return realFetch(fake, init);
  }
  throw blocked(url.origin);
};

for (const module of [http, https]) {
  for (const name of ["request", "get"]) {
    const real = module[name];
    module[name] = function (target, ...rest) {
      const host = typeof target === "string" || target instanceof URL ? new URL(target).hostname : (target?.hostname ?? target?.host ?? "localhost");
      if (!LOOPBACK.has(String(host).replace(/:\d+$/, ""))) throw blocked(String(host));
      return real.call(this, target, ...rest);
    };
  }
}
