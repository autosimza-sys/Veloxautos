import assert from "node:assert/strict";
import { test } from "node:test";
import { publicationRequest } from "../features/publication/publication-request.js";

const draft = () => ({ userId: "test-owner", form: { brand: "Synthetic", model: "Fixture" },
  photoFiles: [{ kind: "front", file: new File(["test bytes"], "front.jpg", { type: "image/jpeg" }) }],
});
function storageFixture() {
  const values = new Map();
  return { values, getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test("new File instances and reordered form keys recover the same pending request", async () => {
  const storage = storageFixture();
  const first = await publicationRequest(draft(), storage);
  const next = draft();
  next.form = { model: "Fixture", brand: "Synthetic" };
  const second = await publicationRequest(next, storage);
  assert.equal(first.id, second.id);
  assert.ok([...storage.values.keys()].every(key => !key.includes("Synthetic")));
  assert.equal([...storage.values.values()][0], first.id);
  first.complete();
  assert.equal(storage.values.size, 0);
  assert.notEqual((await publicationRequest(draft(), storage)).id, first.id);
});
test("changed file bytes or another owner receive a different intention id", async () => {
  const storage = storageFixture();
  const first = await publicationRequest(draft(), storage);
  const changed = draft();
  changed.photoFiles[0].file = new File(["changed bytes"], "front.jpg", { type: "image/jpeg" });
  assert.notEqual((await publicationRequest(changed, storage)).id, first.id);
  assert.notEqual((await publicationRequest({ ...draft(), userId: "other-owner" }, storage)).id, first.id);
});
test("different selection order for identical photo slots recovers the same request", async () => {
  const storage = storageFixture();
  const request = draft();
  request.photoFiles.push({ kind: "interior", file: new File(["interior"], "inside.jpg", { type: "image/jpeg" }) });
  const first = await publicationRequest(request, storage);
  const reversed = await publicationRequest({ ...request, photoFiles: [...request.photoFiles].reverse() }, storage);
  assert.equal(reversed.id, first.id);
});
