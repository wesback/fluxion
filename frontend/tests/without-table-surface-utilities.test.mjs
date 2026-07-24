import test from "node:test"
import assert from "node:assert/strict"
import { withoutTableSurfaceUtilities } from "../lib/without-table-surface-utilities.mjs"

test("removes background-writing Tailwind utilities including variants and suffix important", () => {
  const input = [
    "p-4", "text-sm", "border", "hidden", "md:table-cell",
    "bg-red-500", "bg-red-500!", "hover:bg-red-500",
    "dark:hover:bg-red-500!", "data-[state=selected]:bg-red-500",
    "[&:nth-child(2)]:bg-red-500", "[&:nth-child(2)]:hover:bg-red-500!",
    "from-blue-500", "via-blue-500!", "to-blue-500",
    "[background:red]", "[background-color:rgb(1,2,3)]!",
    "hover:[background-image:linear-gradient(red,blue)]",
  ].join(" ")

  assert.equal(
    withoutTableSurfaceUtilities(input),
    "p-4 text-sm border hidden md:table-cell",
  )
})

test("preserves non-background arbitrary, layout, typography, and border utilities", () => {
  const input = [
    "md:p-4", "text-sm", "border", "border-red-500",
    "[color:canvastext]", "[mask-image:none]",
    "[&:nth-child(2)]:text-sm", "[&:nth-child(2)]:border-red-500",
    "hover:text-primary", "data-[state=selected]:text-accent-foreground",
  ].join(" ")
  assert.equal(withoutTableSurfaceUtilities(input), input)
})

test("accepts omitted className", () => {
  assert.equal(withoutTableSurfaceUtilities(), undefined)
})
