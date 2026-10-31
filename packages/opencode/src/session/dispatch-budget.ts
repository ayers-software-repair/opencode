// Copyright Ayers Electronics Inc. All rights reserved.

export function singleGeneration() {
  let dispatched = false
  return () => {
    if (dispatched) throw new Error("Single-generation dispatch limit reached")
    dispatched = true
  }
}
