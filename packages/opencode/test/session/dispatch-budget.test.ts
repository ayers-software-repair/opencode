// Copyright Ayers Electronics Inc. All rights reserved.
import { expect, test } from "bun:test"
import { singleGeneration } from "../../src/session/dispatch-budget"

test("one shared run budget rejects every later dispatch", () => {
  const dispatch = singleGeneration()
  expect(dispatch()).toBeUndefined()
  expect(dispatch).toThrow("Single-generation dispatch limit reached")
  expect(dispatch).toThrow("Single-generation dispatch limit reached")
})

test("separate turns receive separate budgets", () => {
  expect(singleGeneration()()).toBeUndefined()
  expect(singleGeneration()()).toBeUndefined()
})

test("concurrent retry and continuation cannot both consume the budget", async () => {
  const dispatch = singleGeneration()
  const results = await Promise.allSettled([Promise.resolve().then(dispatch), Promise.resolve().then(dispatch)])
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
})
