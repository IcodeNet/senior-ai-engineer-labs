import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { other, small, wide } from "./embedders.ts";
import { assertCompatible, cosine, dot, euclidean, norm, normalize, rank } from "./index.ts";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe("vector arithmetic", () => {
  test("dot product, norm and Euclidean distance", () => {
    assert.equal(dot([1, 2, 3], [4, 5, 6]), 32);
    assert.equal(norm([3, 4]), 5);
    assert.equal(euclidean([0, 0], [3, 4]), 5);
    assert.equal(euclidean([1, 1], [1, 1]), 0);
  });

  test("vectors of different lengths are never compared", () => {
    assert.throws(() => dot([1, 2], [1, 2, 3]), /dimension mismatch: 2 vs 3/);
    assert.throws(() => euclidean([1], [1, 2]), RangeError);
    assert.throws(() => cosine([1, 2], [1]), RangeError);
  });

  test("normalising keeps the direction and makes the length 1", () => {
    const v = normalize([3, 4]);
    close(v[0], 0.6);
    close(v[1], 0.8);
    close(norm(normalize([1, -2, 7, 0.5])), 1);
    assert.throws(() => normalize([0, 0]), /zero vector/);
  });
});

describe("cosine similarity", () => {
  test("measures the angle: same direction 1, orthogonal 0, opposite -1, whatever the length", () => {
    close(cosine([1, 0], [5, 0]), 1);
    close(cosine([1, 0], [0, 3]), 0);
    close(cosine([1, 1], [-2, -2]), -1);
    close(cosine([1, 2, 3], [10, 20, 30]), 1);
    assert.throws(() => cosine([0, 0], [1, 1]), /zero vector/);
  });

  test("on normalised vectors, cosine equals the dot product, so both rank identically", () => {
    const a = normalize([0.2, -1.4, 3.1, 0.7]);
    const b = normalize([1.1, 0.3, 2.2, -0.4]);
    close(cosine(a, b), dot(a, b));
  });

  test("on unnormalised vectors, the dot product rewards length and can disagree with cosine", () => {
    const query = [1, 0];
    const aligned = [1, 0.1]; // nearly the same direction, short
    const long = [5, 5]; // 45 degrees away, long
    assert.ok(cosine(query, aligned) > cosine(query, long));
    assert.ok(dot(query, long) > dot(query, aligned));
  });
});

describe("ranking embeddings", () => {
  const texts = {
    overdraft: "An arranged overdraft costs 39.9% EAR variable",
    card: "Freeze your card in the app under Cards",
    abroad: "Cash withdrawals abroad are free up to 200 pounds",
  };
  const items = Object.entries(texts).map(([id, text]) => ({ id, embedding: small(text) }));

  test("the chunk sharing the query's words ranks first, for cosine and dot product alike on normalised vectors", () => {
    const query = small("What does an arranged overdraft cost?");
    assert.equal(rank(query, items, "cosine", 3)[0].id, "overdraft");
    const normalised = items.map((i) => ({ id: i.id, embedding: { ...i.embedding, vector: normalize(i.embedding.vector) } }));
    const q = { ...query, vector: normalize(query.vector) };
    assert.deepEqual(rank(q, normalised, "dotProduct", 3).map((r) => r.id), rank(query, items, "cosine", 3).map((r) => r.id));
  });

  test("euclidean scores are negated distances, best first; k limits the results", () => {
    const query = small(texts.card);
    const ranked = rank(query, items, "euclidean", 2);
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0].id, "card");
    assert.equal(ranked[0].score, -0);
    assert.ok(ranked[0].score >= ranked[1].score);
    assert.throws(() => rank(query, items, "cosine", 0), RangeError);
  });
});

describe("model and dimensions must match", () => {
  test("a query from another model or with other dimensions is refused before any arithmetic", () => {
    assert.throws(() => assertCompatible(other("overdraft"), small("overdraft")), /query embedded with toy-other, but the index holds toy-small vectors/);
    assert.throws(() => assertCompatible(wide("overdraft"), small("overdraft")), /query has 128 dimensions, the index field has 64/);
    assert.throws(() => assertCompatible({ model: "toy-small", dimensions: 64, vector: [1, 2] }, { model: "toy-small", dimensions: 64 }), /query has 2 dimensions/);
    assert.throws(() => rank(other("overdraft"), [{ id: "x", embedding: small("overdraft") }], "cosine", 1), /query embedded with toy-other/);
  });

  test("why: the same text in two models' spaces is barely related, while one model is consistent with itself", () => {
    const text = "An arranged overdraft costs 39.9% EAR variable";
    close(cosine(small(text).vector, small(text).vector), 1);
    assert.ok(Math.abs(cosine(small(text).vector, other(text).vector)) < 0.5, "different models put the same text in unrelated places");
  });
});
